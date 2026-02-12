// script.js (Realtime Database "compat" Version - Final Corrected Version)

// --- CONSTANTS & GLOBAL SELECTORS ---
const RANK_ABBREVIATIONS = { 'E-1': 'AB', 'E-2': 'Amn', 'E-3': 'A1C', 'E-4': 'SrA', 'E-5': 'SSgt', 'E-6': 'TSgt', 'E-7': 'MSgt', 'E-8': 'SMSgt', 'E-9': 'CMSgt', 'O-1': '2d Lt', 'O-2': '1st Lt', 'O-3': 'Capt', 'O-4': 'Maj' };

const RANK_ORDER = { 'O-4': 13, 'O-3': 12, 'O-2': 11, 'O-1': 10, 'E-9': 9, 'E-8': 8, 'E-7': 7, 'E-6': 6, 'E-5': 5, 'E-4': 4, 'E-3': 3, 'E-2': 2, 'E-1': 1 };

const SUPERVISOR_RANKS = ['E-5', 'E-6', 'E-7', 'E-8', 'E-9', 'O-1', 'O-2', 'O-3', 'O-4'];

const PROMOTION_SEQUENCE = ['E-1', 'E-2', 'E-3', 'E-4', 'E-5', 'E-6', 'E-7', 'E-8', 'E-9'];

const TEAM_CONTAINERS = ['inbound-container', 'flight-leads-container', 'brass-container', 'sbirs-container'];

const memberModal = document.getElementById('add-member-modal');
const addMemberForm = document.getElementById('add-member-form');
const dutyTitleSelect = document.getElementById('dutyTitle');

const fieldsModal = document.getElementById('manage-fields-modal');
const addFieldForm = document.getElementById('add-field-form');
const detailedViewModal = document.getElementById('detailed-view-modal');

let ALL_MEMBERS_CACHE = [];
let CUSTOM_FIELDS_CACHE = [];
let FLIGHTS_CACHE = [];
let FIELD_GROUPS_CACHE = [];
let CURRENT_ROLE = 'admin';
let activeFlightId = null;

// --- CUSTOM DIALOG FUNCTIONS (replaces prompt/alert/confirm) ---

function showCustomDialog({ title, message, inputDefault, showInput, showCancel, dangerOk }) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('custom-dialog-overlay');
        const titleEl = document.getElementById('custom-dialog-title');
        const messageEl = document.getElementById('custom-dialog-message');
        const inputEl = document.getElementById('custom-dialog-input');
        const okBtn = document.getElementById('custom-dialog-ok');
        const cancelBtn = document.getElementById('custom-dialog-cancel');

        titleEl.textContent = title || '';
        messageEl.textContent = message || '';
        inputEl.style.display = showInput ? 'block' : 'none';
        inputEl.value = inputDefault || '';
        cancelBtn.style.display = showCancel ? 'inline-block' : 'none';

        if (dangerOk) {
            okBtn.className = 'custom-dialog-btn custom-dialog-btn-danger';
            okBtn.textContent = dangerOk;
        } else {
            okBtn.className = 'custom-dialog-btn custom-dialog-btn-ok';
            okBtn.textContent = 'OK';
        }

        overlay.classList.add('active');
        if (showInput) inputEl.focus();

        function cleanup() {
            overlay.classList.remove('active');
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            inputEl.removeEventListener('keydown', onKeydown);
        }

        function onOk() {
            cleanup();
            if (showInput) resolve(inputEl.value);
            else resolve(true);
        }

        function onCancel() {
            cleanup();
            resolve(showInput ? null : false);
        }

        function onKeydown(e) {
            if (e.key === 'Enter') onOk();
            if (e.key === 'Escape') onCancel();
        }

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        if (showInput) inputEl.addEventListener('keydown', onKeydown);
    });
}

function customAlert(message, title = 'Notice') {
    return showCustomDialog({ title, message, showInput: false, showCancel: false });
}

function customConfirm(message, title = 'Confirm', dangerOk = null) {
    return showCustomDialog({ title, message, showInput: false, showCancel: true, dangerOk });
}

function customPrompt(message, defaultValue = '', title = 'Input') {
    return showCustomDialog({ title, message, inputDefault: defaultValue, showInput: true, showCancel: true });
}

// --- DATA FUNCTIONS ---

async function getCustomFields() {
    try {
        const snapshot = await database.ref('/_config/customFields').get();
        if (!snapshot.exists()) {
            // If the path doesn't exist, return a clean empty array.
            return [];
        }

        const value = snapshot.val();

        if (Array.isArray(value)) {
            // If it's already a valid array, return it.
            return value;
        }

        if (typeof value === 'object' && value !== null) {
            // If it's a Firebase object (e.g., {0: {...}, 1: {...}}), convert it to an array.
            return Object.values(value);
        }

        // If it's null, undefined, or some other unexpected type, return a safe empty array.
        return [];

    } catch (error) {
        console.error("Error fetching custom fields:", error);
        // On error, always return a safe empty array so the rest of the app doesn't break.
        return [];
    }
}

async function saveCustomFields(fields) {
    try {
        await database.ref('/_config/customFields').set(fields);
        CUSTOM_FIELDS_CACHE = fields;
    } catch (error) {
        console.error("Error saving custom fields:", error);
        customAlert("There was an error saving the custom fields. Please try again.", "Error");
    }
}

async function getFlights() {
    try {
        const snapshot = await database.ref('/_config/flights').get();
        if (!snapshot.exists()) return [];
        const value = snapshot.val();
        if (Array.isArray(value)) return value;
        if (typeof value === 'object' && value !== null) return Object.values(value);
        return [];
    } catch (error) {
        console.error("Error fetching flights:", error);
        return [];
    }
}

async function saveFlights(flights) {
    try {
        await database.ref('/_config/flights').set(flights);
        FLIGHTS_CACHE = flights;
    } catch (error) {
        console.error("Error saving flights:", error);
        customAlert("There was an error saving flights. Please try again.", "Error");
    }
}

let getFlightsRequest = null;
async function getCachedFlights(forceRefresh = false) {
    if (FLIGHTS_CACHE.length > 0 && !forceRefresh) return FLIGHTS_CACHE;
    if (!getFlightsRequest) {
        getFlightsRequest = getFlights().finally(() => { getFlightsRequest = null; });
    }
    FLIGHTS_CACHE = await getFlightsRequest;
    return FLIGHTS_CACHE;
}

// --- FIELD GROUPS ---
async function getFieldGroups() {
    try {
        const snapshot = await database.ref('/_config/fieldGroups').get();
        if (!snapshot.exists()) return [];
        const value = snapshot.val();
        if (Array.isArray(value)) return value;
        if (typeof value === 'object' && value !== null) return Object.values(value);
        return [];
    } catch (error) {
        console.error("Error fetching field groups:", error);
        return [];
    }
}

async function saveFieldGroups(groups) {
    try {
        await database.ref('/_config/fieldGroups').set(groups);
        FIELD_GROUPS_CACHE = groups;
    } catch (error) {
        console.error("Error saving field groups:", error);
        customAlert("Error saving field groups.", "Error");
    }
}

let getGroupsRequest = null;
async function getCachedGroups(forceRefresh = false) {
    if (FIELD_GROUPS_CACHE.length > 0 && !forceRefresh) return FIELD_GROUPS_CACHE;
    if (!getGroupsRequest) {
        getGroupsRequest = getFieldGroups().finally(() => { getGroupsRequest = null; });
    }
    FIELD_GROUPS_CACHE = await getGroupsRequest;
    return FIELD_GROUPS_CACHE;
}

// --- ACCESS CONTROL ---
async function getAccessRole() {
    try {
        const snapshot = await database.ref('/_config/accessRole').get();
        if (!snapshot.exists()) return 'admin';
        return snapshot.val() || 'admin';
    } catch (error) { return 'admin'; }
}

async function saveAccessRole(role) {
    try {
        await database.ref('/_config/accessRole').set(role);
        CURRENT_ROLE = role;
    } catch (error) {
        console.error("Error saving access role:", error);
    }
}

function canManageFields() { return CURRENT_ROLE === 'admin'; }
function canViewFields() { return true; } // All roles can view

async function getAllMembers() {
    const teamNames = ['brass', 'flight-leads', 'inbound', 'sbirs'];
    const allMembers = [];
    const promises = teamNames.map(name => database.ref(name).get());
    try {
        const snapshots = await Promise.all(promises);
        snapshots.forEach(snapshot => {
            if (snapshot.exists()) {
                const teamData = snapshot.val();
                // Ensure we only process valid arrays
                if (Array.isArray(teamData)) {
                    teamData.forEach(member => {
                        // Ensure member is a valid object with a rowId before adding
                        if (member && member.rowId) {
                            allMembers.push(member);
                        }
                    });
                }
            }
        });
        return allMembers;
    } catch (error) {
        console.error("Error fetching data:", error);
        customAlert("Failed to load data from Firebase. Check console for errors.", "Error");
        return [];
    }
}

async function saveMember(memberData, isEditing = false) {
    const teamName = memberData.teamSelect.replace('-container', '');
    const teamRef = database.ref(teamName);

    const customData = {};
    CUSTOM_FIELDS_CACHE.forEach(field => {
        const key = `custom_${field.id}`;
        if (memberData[key] !== undefined) {
            customData[field.id] = memberData[key];
            delete memberData[key];
        }
    });

    try {
        const snapshot = await teamRef.get();
        let teamArray = snapshot.exists() && Array.isArray(snapshot.val()) ? snapshot.val().filter(m => m && m.rowId) : [];
        if (isEditing) {
            const memberIndex = teamArray.findIndex(m => m.rowId === memberData.rowId);
            if (memberIndex !== -1) {
                const existingMember = teamArray[memberIndex];
                const finalCustomData = { ...(existingMember.customData || {}), ...customData };
                teamArray[memberIndex] = { ...existingMember, ...memberData, customData: finalCustomData };
            } else {
                memberData.customData = customData;
                teamArray.push(memberData);
            }
        } else {
            memberData.customData = customData;
            teamArray.push(memberData);
        }
        // Filter out any null entries before setting
        const cleanTeamArray = teamArray.filter(m => m && m.rowId);
        await teamRef.set(cleanTeamArray);
    } catch (error) {
        console.error("Error saving member:", error);
        customAlert("There was an error saving the member. Please try again.", "Error");
    }
}

async function deleteMember(memberData) {
    const confirmed = await customConfirm(`Are you sure you want to permanently delete ${memberData.lastName}?`, "Delete Member", "Delete");
    if (!confirmed) return;
    const allMembers = await getCachedMembers();
    if (allMembers.some(m => m.supervisor === memberData.rowId)) {
        return customAlert(`Cannot delete ${memberData.lastName}. Please re-assign their supervisee(s) first.`, "Cannot Delete");
    }
    const teamName = memberData.teamSelect.replace('-container', '');
    const teamRef = database.ref(teamName);
    try {
        const snapshot = await teamRef.get();
        if (!snapshot.exists()) return;
        let teamArray = Array.isArray(snapshot.val()) ? snapshot.val() : [];
        const newTeamArray = teamArray.filter(m => m && m.rowId !== memberData.rowId);
        await teamRef.set(newTeamArray);
        await renderAll(true);
    } catch (error) {
        console.error("Error deleting member:", error);
        customAlert("There was an error deleting the member. Please try again.", "Error");
    }
}

// --- AUTO-PROMOTION LOGIC ---

async function checkAndProcessAutoPromotions(allMembers) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let promotionsProcessed = false;

    for (const member of allMembers) {
        // Check for scheduled promotions (selected members with a set promotion date)
        if (member.promotionStatus === 'selected' && member.promotionDate) {
            const promoDate = new Date(member.promotionDate);
            promoDate.setHours(0, 0, 0, 0);
            if (today >= promoDate) {
                const currentRankIndex = PROMOTION_SEQUENCE.indexOf(member.rank);
                if (currentRankIndex > -1 && currentRankIndex < PROMOTION_SEQUENCE.length - 1) {
                    member.rank = PROMOTION_SEQUENCE[currentRankIndex + 1];
                    member.dorDate = member.promotionDate;
                    member.promotionDate = '';
                    member.promotionStatus = '';
                    await saveMember(member, true);
                    promotionsProcessed = true;
                    continue;
                }
            }
        }

        if (!member.tisDate || !member.dorDate) continue;

        const monthsTIS = getMonthsDifference(new Date(member.tisDate), today);
        const monthsTIG = getMonthsDifference(new Date(member.dorDate), today);
        let shouldPromote = false;
        let newRank = null;
        let newDorDate = null;

        switch (member.rank) {
            case 'E-1':
                if (monthsTIS >= 6 && monthsTIG >= 6) {
                    shouldPromote = true;
                    newRank = 'E-2';
                    newDorDate = calculatePromotionDate(member.tisDate, member.dorDate, 6, 6);
                }
                break;
            case 'E-2':
                if (monthsTIG >= 10) {
                    shouldPromote = true;
                    newRank = 'E-3';
                    newDorDate = calculatePromotionDate(null, member.dorDate, null, 10);
                }
                break;
            case 'E-3':
                // For E-3, only auto-promote if they've been marked as not-selected for BTZ
                // and they've reached the standard promotion date
                if (member.btzStatus === 'not-selected') {
                    const tisPathDate = new Date(member.tisDate);
                    tisPathDate.setMonth(tisPathDate.getMonth() + 36);
                    const tigPathDate = new Date(member.dorDate);
                    tigPathDate.setMonth(tigPathDate.getMonth() + 28);
                    const standardPromoDateRaw = (tisPathDate < tigPathDate) ? tisPathDate : tigPathDate;
                    const standardPromoDate = new Date(standardPromoDateRaw);
                    standardPromoDate.setDate(standardPromoDate.getDate() + 1);

                    if (today >= standardPromoDate) {
                        shouldPromote = true;
                        newRank = 'E-4';
                        newDorDate = standardPromoDate.toISOString().slice(0, 10);
                    }
                }
                break;
            // E-4 to E-5, E-5 to E-6, E-6 to E-7, E-7 to E-8, and E-8 to E-9 require selection, so no auto-promotion
        }

        if (shouldPromote && newRank && newDorDate) {
            member.rank = newRank;
            member.dorDate = newDorDate;
            await saveMember(member, true);
            promotionsProcessed = true;
        }
    }

    return promotionsProcessed;
}

function calculatePromotionDate(tisDate, dorDate, tisMonths, tigMonths) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let promoDate = null;

    if (tisMonths !== null && tisDate) {
        const tisPath = new Date(tisDate);
        tisPath.setMonth(tisPath.getMonth() + tisMonths);
        tisPath.setDate(tisPath.getDate() + 1); // Add 1 day to complete the period
        promoDate = tisPath;
    }

    if (tigMonths !== null && dorDate) {
        const tigPath = new Date(dorDate);
        tigPath.setMonth(tigPath.getMonth() + tigMonths);
        tigPath.setDate(tigPath.getDate() + 1); // Add 1 day to complete the period

        // Use the later of TIS or TIG if both exist
        if (promoDate && tigPath < promoDate) {
            promoDate = promoDate;
        } else {
            promoDate = tigPath;
        }
    }

    return promoDate.toISOString().slice(0, 10);
}

function getMonthsDifference(d1, d2) {
    if (!d1 || !d2) return 0;
    return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
}

// --- CACHING & HELPER FUNCTIONS ---

let getMembersRequest = null;
async function getCachedMembers(forceRefresh = false) {
    if (ALL_MEMBERS_CACHE.length > 0 && !forceRefresh) return ALL_MEMBERS_CACHE;
    if (!getMembersRequest) {
        getMembersRequest = getAllMembers().finally(() => { getMembersRequest = null; });
    }
    ALL_MEMBERS_CACHE = await getMembersRequest;
    return ALL_MEMBERS_CACHE;
}

let getFieldsRequest = null;
async function getCachedFields(forceRefresh = false) {
    if (CUSTOM_FIELDS_CACHE.length > 0 && !forceRefresh) return CUSTOM_FIELDS_CACHE;
    if (!getFieldsRequest) {
        getFieldsRequest = getCustomFields().finally(() => { getFieldsRequest = null; });
    }
    CUSTOM_FIELDS_CACHE = await getFieldsRequest;
    return CUSTOM_FIELDS_CACHE;
}

function findMemberById(id, memberList) {
    if (!id || !Array.isArray(memberList)) return null;
    return memberList.find(m => m && m.rowId === id);
}

// --- RENDERING & UI FUNCTIONS ---

async function renderAll(forceRefresh = false) {
    const [allMembers, customFields, flights, groups] = await Promise.all([
        getCachedMembers(forceRefresh),
        getCachedFields(forceRefresh),
        getCachedFlights(forceRefresh),
        getCachedGroups(forceRefresh)
    ]);

    // Auto-create default flight if none exist and there are members
    if (flights.length === 0 && allMembers.length > 0) {
        const defaultFlight = { id: `flight_${Date.now()}`, name: 'GSPS' };
        flights.push(defaultFlight);
        await saveFlights(flights);
        // Assign all existing members to this flight
        for (const member of allMembers) {
            if (!member.flight) {
                member.flight = defaultFlight.id;
                await saveMember(member, true);
            }
        }
        const updatedMembers = await getCachedMembers(true);
        allMembers.length = 0;
        allMembers.push(...updatedMembers);
    }

    // Set active flight if not set
    if (!activeFlightId && flights.length > 0) {
        activeFlightId = flights[0].id;
    }

    // Render flight tabs
    renderFlightTabs(flights);

    // Update flight dropdown in form
    updateFlightDropdown(flights);

    // Check and process automatic promotions
    const promotionsProcessed = await checkAndProcessAutoPromotions(allMembers);

    // If promotions were processed, refresh the member list
    if (promotionsProcessed) {
        const updatedMembers = await getCachedMembers(true);
        allMembers.length = 0;
        allMembers.push(...updatedMembers);
    }

    const subTabNav = document.getElementById('sub-tab-nav');
    const unbilletedView = document.getElementById('unbilleted-view');
    const teamOverview = document.getElementById('team-overview');
    const supervisionView = document.getElementById('supervision-view');

    if (activeFlightId === 'unbilleted') {
        // Show unbilleted view, hide sub-tabs
        subTabNav.style.display = 'none';
        teamOverview.classList.remove('active');
        supervisionView.classList.remove('active');
        unbilletedView.classList.add('active');
        renderUnbilletedView(allMembers, flights, customFields);
    } else {
        // Show sub-tabs, hide unbilleted
        subTabNav.style.display = 'flex';
        unbilletedView.classList.remove('active');

        // Filter members for active flight
        const flightMembers = allMembers.filter(m => m.flight === activeFlightId);

        TEAM_CONTAINERS.forEach(id => {
            const container = document.getElementById(id);
            if (container) container.innerHTML = '';
        });

        if (Array.isArray(flightMembers)) {
            flightMembers.sort((a, b) => (RANK_ORDER[b.rank] || 0) - (RANK_ORDER[a.rank] || 0) || a.lastName.localeCompare(b.lastName));

            for (const member of flightMembers) {
                if (member && member.teamSelect) {
                    const container = document.getElementById(member.teamSelect);
                    if (container) {
                        container.appendChild(createMemberCardElement(member, allMembers, customFields));
                    }
                }
            }
        }

        const activeTab = document.querySelector('.tab-btn.active');
        if (activeTab && activeTab.dataset.tab === 'team-overview') {
            teamOverview.classList.add('active');
            supervisionView.classList.remove('active');
        } else if (activeTab && activeTab.dataset.tab === 'supervision-view') {
            teamOverview.classList.remove('active');
            supervisionView.classList.add('active');
            renderSupervisionChart(flightMembers);
        }
    }

    await updateSupervisorDropdown(allMembers);
}

function renderFlightTabs(flights) {
    const nav = document.getElementById('flight-tab-nav');
    nav.innerHTML = '';

    flights.forEach(flight => {
        const btn = document.createElement('button');
        btn.className = 'flight-tab' + (activeFlightId === flight.id ? ' active' : '');
        btn.dataset.flightId = flight.id;
        btn.textContent = flight.name;
        btn.addEventListener('click', () => {
            activeFlightId = flight.id;
            renderAll();
        });
        // Right-click to delete flight
        btn.addEventListener('contextmenu', async (e) => {
            e.preventDefault();
            if (await customConfirm(`Delete flight "${flight.name}"? Members will become unbilleted.`, "Delete Flight", "Delete")) {
                // Unbillet all members in this flight
                const allMembers = await getCachedMembers();
                for (const member of allMembers) {
                    if (member.flight === flight.id) {
                        member.flight = '';
                        await saveMember(member, true);
                    }
                }
                const updatedFlights = FLIGHTS_CACHE.filter(f => f.id !== flight.id);
                await saveFlights(updatedFlights);
                activeFlightId = updatedFlights.length > 0 ? updatedFlights[0].id : 'unbilleted';
                await renderAll(true);
            }
        });
        nav.appendChild(btn);
    });

    // Add "+" button
    const addBtn = document.createElement('button');
    addBtn.className = 'flight-tab add-flight-btn';
    addBtn.textContent = '+';
    addBtn.title = 'Add New Flight';
    addBtn.addEventListener('click', async () => {
        const name = await customPrompt("Enter the name for the new flight:", "", "New Flight");
        if (!name || !name.trim()) return;
        const newFlight = { id: `flight_${Date.now()}`, name: name.trim() };
        const updatedFlights = [...FLIGHTS_CACHE, newFlight];
        await saveFlights(updatedFlights);
        activeFlightId = newFlight.id;
        await renderAll(true);
    });
    nav.appendChild(addBtn);

    // Add "Unbilleted" tab
    const unbilletedBtn = document.createElement('button');
    unbilletedBtn.className = 'flight-tab unbilleted-tab' + (activeFlightId === 'unbilleted' ? ' active' : '');
    unbilletedBtn.textContent = 'Unbilleted';
    unbilletedBtn.addEventListener('click', () => {
        activeFlightId = 'unbilleted';
        renderAll();
    });
    nav.appendChild(unbilletedBtn);
}

function renderUnbilletedView(allMembers, flights, customFields) {
    const container = document.getElementById('unbilleted-view');
    const unbilletedMembers = allMembers.filter(m => !m.flight);

    let html = '<div class="unbilleted-layout">';

    // Members list
    html += '<div class="unbilleted-members-section"><h2 class="section-header">Unassigned Members</h2>';
    if (unbilletedMembers.length === 0) {
        html += '<p style="color: #bdc3c7; padding: 15px;">All members are assigned to a flight.</p>';
    } else {
        html += '<div class="unbilleted-members-list">';
        unbilletedMembers.sort((a, b) => (RANK_ORDER[b.rank] || 0) - (RANK_ORDER[a.rank] || 0) || a.lastName.localeCompare(b.lastName));
        unbilletedMembers.forEach(member => {
            const rankDisplay = RANK_ABBREVIATIONS[member.rank] || member.rank;
            html += `<div class="unbilleted-card" draggable="true" data-member-id="${member.rowId}"><span class="unbilleted-card-name">${rankDisplay} ${member.lastName}, ${member.firstName}</span><span class="unbilleted-card-duty">${member.dutyTitle || ''}</span></div>`;
        });
        html += '</div>';
    }
    html += '</div>';

    // Flight drop zones
    html += '<div class="flight-drop-zones-section"><h2 class="section-header">Assign to Flight</h2>';
    html += '<div class="flight-drop-zones">';
    flights.forEach(flight => {
        const flightMembers = allMembers.filter(m => m.flight === flight.id);
        html += `<div class="flight-drop-zone" data-flight-id="${flight.id}"><div class="flight-drop-zone-title">${flight.name}</div><div class="flight-drop-zone-count">${flightMembers.length} member${flightMembers.length !== 1 ? 's' : ''}</div></div>`;
    });
    html += '</div></div>';

    html += '</div>';
    container.innerHTML = html;

    // Add drag-and-drop handlers for unbilleted cards
    container.querySelectorAll('.unbilleted-card').forEach(card => {
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', card.dataset.memberId);
            e.dataTransfer.effectAllowed = 'move';
            setTimeout(() => card.classList.add('dragging'), 0);
        });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));
    });

    // Add drop handlers for flight zones
    container.querySelectorAll('.flight-drop-zone').forEach(zone => {
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            zone.classList.add('drag-over');
        });
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
        zone.addEventListener('drop', async (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            const memberId = e.dataTransfer.getData('text/plain');
            const member = findMemberById(memberId, ALL_MEMBERS_CACHE);
            if (member) {
                member.flight = zone.dataset.flightId;
                await saveMember(member, true);
                await renderAll(true);
            }
        });
    });
}

function updateFlightDropdown(flights) {
    const select = document.getElementById('flight');
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML = '<option value="">Unbilleted</option>';
    flights.forEach(flight => {
        const option = new Option(flight.name, flight.id);
        select.add(option);
    });
    select.value = currentValue;
}

function createMemberCardElement(member, allMembers, customFields) {
    const card = document.createElement('div');
    card.className = 'member-card';
    card.id = member.rowId;
    card.draggable = true;

    const eligibility = calculatePromotionEligibility(member);
    const rankDisplay = RANK_ABBREVIATIONS[member.rank] || member.rank;
    const dutyTitleSubtitle = `<span class="card-subtitle">${member.dutyTitle || 'N/A'}</span>`;
    
    const promotionTagHTML = eligibility.showPromoteButton ? `<span class="promotion-tag" title="Promotion Eligible">P</span>` : '';

    let promoSoonHTML = '';
    if (member.promotionDate) {
        const promoDate = new Date(member.promotionDate);
        const todayCheck = new Date();
        todayCheck.setHours(0, 0, 0, 0);
        const daysUntil = Math.ceil((promoDate - todayCheck) / (1000 * 60 * 60 * 24));
        if (daysUntil >= 0 && daysUntil <= 14) {
            promoSoonHTML = `<span class="promo-soon-tag" title="Promotion in ${daysUntil} days">Promo Soon!</span>`;
        }
    }

    let statusTagHTML = '';
    if (member.dutyTitle !== 'Flight Chief' && member.dutyTitle !== 'Flight Commander') {
        const statusSlug = (member.status || 'unknown').toLowerCase().replace(/[\s-]/g, '_');
        statusTagHTML = `<span class="status-tag status-${statusSlug}">${member.status || 'N/A'}</span>`;
    }
    
    const medicalTagHTML = member.medicalProfile === 'Permanent' ? `<span class="medical-tag" title="Permanent Medical Profile">MED</span>` : '';
    const promoteButtonHTML = eligibility.showPromoteButton ? `<button class="action-btn promote-btn" title="Promote Member">⬆️</button>` : '';

    let eligibilityHTML = `${eligibility.status}${promoteButtonHTML}<span class="eligibility-note">${eligibility.note}</span>`;
    if (eligibility.className === 'board-concluded' || eligibility.className === 'btz-this-q') {
        eligibilityHTML += `<br><button class="btz-action-btn" data-action="selected" data-new-dor="${eligibility.btzPromoDate}">Selected</button><button class="btz-action-btn" data-action="not-selected">Not Selected</button>`;
    }
    if (eligibility.className === 'promo-eligible') {
        eligibilityHTML += `<br><button class="selection-btn" data-action="selected">Selected</button><button class="selection-btn" data-action="not-selected">Not Selected</button>`;
    }
    if (eligibility.className === 'promo-selected') {
        eligibilityHTML += `<br><button class="selection-btn edit-promo-date-btn">Edit Date</button>`;
    }
    
    const supervisor = findMemberById(member.supervisor, allMembers);
    const supervisorName = supervisor ? `${RANK_ABBREVIATIONS[supervisor.rank] || supervisor.rank} ${supervisor.lastName}` : 'N/A';

    // === ALERT ICON LOGIC UPDATED HERE ===
    let alertHTML = '';
    if (eligibility.className === 'btz-next-q' || eligibility.className === 'btz-this-q') {
        alertHTML = `<div class="alert-icon" title="BTZ Board Next Quarter">!</div>`;
    } else if (eligibility.className === 'btz-two-q') {
        alertHTML = `<div class="alert-icon-warning" title="BTZ Board in 2 Quarters">!</div>`;
    }
    
    const headerHTML = `<div class="card-header">${alertHTML}<div class="title-block"><span class="card-title">${rankDisplay} ${member.lastName}, ${member.firstName}</span>${dutyTitleSubtitle}</div>${statusTagHTML}${medicalTagHTML}${promoSoonHTML}${promotionTagHTML}<div class="hamburger-menu">☰</div><div class="context-menu"><button class="context-btn detail-btn">Detailed View</button><button class="context-btn modify-btn">Modify</button><button class="context-btn delete-btn">Delete</button></div></div>`;
    
    const gridItems = [];
    if (member.dutyTitle !== 'Flight Chief' && member.dutyTitle !== 'Flight Commander') gridItems.push(`<strong>Status:</strong><span>${member.status || 'N/A'}</span>`);
    if (member.dutyTitle !== 'Flight Commander') gridItems.push(`<strong>Supervisor:</strong><span>${supervisorName}</span>`);
    gridItems.push(`<strong>TIS Date:</strong><span>${member.tisDate || 'N/A'}</span>`);
    gridItems.push(`<strong>Date of Rank:</strong><span>${member.dorDate || 'N/A'}</span>`);
    gridItems.push(`<strong>Hometown:</strong><span>${member.hometown || 'N/A'}</span>`);

    const collapsibleItems = [];
    if (member.customData && customFields) {
        const visibleFields = customFields.filter(f => f.visible !== false || CURRENT_ROLE === 'admin');
        visibleFields.sort((a, b) => (a.order || 0) - (b.order || 0));
        visibleFields.forEach(field => {
            if (field.showOnCard) {
                let value = member.customData[field.id];
                if (field.type === 'checkbox') value = value === 'true' || value === true ? 'Yes' : 'No';
                else if (!value) return;
                const item = `<strong>${field.name}:</strong><span>${value}</span>`;
                if (field.cardDisplay === 'collapsible') collapsibleItems.push(item);
                else gridItems.push(item);
            }
        });
    }

    let collapsibleHTML = '';
    if (collapsibleItems.length > 0) {
        collapsibleHTML = `<div class="card-collapsible-section"><div class="card-collapsible-header">More Details</div><div class="card-collapsible-grid card-detail-grid">${collapsibleItems.join('')}</div></div>`;
    }

    const bodyGrid = `<div class="card-detail-grid">${gridItems.join('')}</div>`;
    const eligibilityDiv = `<div class="eligibility-cell eligibility-${eligibility.className}">${eligibilityHTML}</div>`;
    const bodyHTML = `<div class="card-body">${bodyGrid}${collapsibleHTML}${eligibilityDiv}</div>`;

    card.innerHTML = headerHTML + bodyHTML;
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
    card.addEventListener('dragover', handleTeamCardDragOver);
    card.addEventListener('drop', handleDrop);
    card.addEventListener('click', handleCardActions);

    return card;
}


// --- MODAL & FORM LOGIC ---

async function openAddModal() {
    addMemberForm.reset();
    document.getElementById('edit-row-id').value = '';
    document.getElementById('modal-title').textContent = 'Add New Member';
    document.getElementById('modal-submit-btn').textContent = 'Add Member';
    await updateSupervisorDropdown();
    renderCustomFieldsOnForm();
    handleAssignmentChange();
    // Default flight to active flight
    const flightSelect = document.getElementById('flight');
    if (flightSelect && activeFlightId && activeFlightId !== 'unbilleted') {
        flightSelect.value = activeFlightId;
    }
    memberModal.style.display = 'block';
}

async function openEditModal(memberId) {
    const memberData = findMemberById(memberId, await getCachedMembers());
    if (!memberData) return;
    addMemberForm.reset();
    for (const key in memberData) {
        if (addMemberForm.elements[key]) {
            addMemberForm.elements[key].value = memberData[key];
        }
    }
    document.getElementById('modal-title').textContent = 'Edit Member Details';
    document.getElementById('modal-submit-btn').textContent = 'Save Changes';
    await updateSupervisorDropdown(await getCachedMembers(), memberId);
    renderCustomFieldsOnForm(memberData);
    handleAssignmentChange();
    memberModal.style.display = 'block';
}

function renderCustomFieldsOnForm(memberData = null) {
    const container = document.getElementById('custom-fields-container');
    const fieldset = document.getElementById('custom-fields-fieldset');
    container.innerHTML = '';

    // Filter fields visible to current role
    const visibleFields = CUSTOM_FIELDS_CACHE.filter(f => f.visible !== false || CURRENT_ROLE === 'admin');
    if (visibleFields.length === 0) {
        fieldset.style.display = 'none';
        return;
    }

    fieldset.style.display = 'block';

    // Sort by order
    const sorted = [...visibleFields].sort((a, b) => (a.order || 0) - (b.order || 0));

    // Group fields
    const groups = {};
    const ungrouped = [];
    sorted.forEach(field => {
        if (field.group) {
            if (!groups[field.group]) groups[field.group] = [];
            groups[field.group].push(field);
        } else {
            ungrouped.push(field);
        }
    });

    // Render grouped fields
    const orderedGroups = [...FIELD_GROUPS_CACHE].sort((a, b) => (a.order || 0) - (b.order || 0));
    orderedGroups.forEach(group => {
        const groupFields = groups[group.id];
        if (!groupFields || groupFields.length === 0) return;

        const groupDiv = document.createElement('div');
        groupDiv.className = 'custom-field-group';
        const header = document.createElement('div');
        header.className = 'custom-field-group-header';
        header.innerHTML = `<span class="group-toggle-icon">▼</span> ${group.name}`;
        header.addEventListener('click', () => {
            const content = groupDiv.querySelector('.custom-field-group-content');
            const icon = header.querySelector('.group-toggle-icon');
            const isCollapsed = content.style.display === 'none';
            content.style.display = isCollapsed ? 'grid' : 'none';
            icon.textContent = isCollapsed ? '▼' : '▶';
        });
        groupDiv.appendChild(header);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'custom-field-group-content form-grid';
        groupFields.forEach(field => contentDiv.appendChild(createFieldInput(field, memberData)));
        groupDiv.appendChild(contentDiv);
        container.appendChild(groupDiv);
    });

    // Render ungrouped fields
    if (ungrouped.length > 0) {
        const ungroupedGrid = document.createElement('div');
        ungroupedGrid.className = 'form-grid';
        ungrouped.forEach(field => ungroupedGrid.appendChild(createFieldInput(field, memberData)));
        container.appendChild(ungroupedGrid);
    }

    // Apply dependency logic
    applyFieldDependencies(memberData);
}

function createFieldInput(field, memberData) {
    const value = memberData?.customData?.[field.id] || '';
    const fieldId = `custom_${field.id}`;
    const div = document.createElement('div');
    div.className = 'custom-field-wrapper';
    div.dataset.customFieldId = field.id;

    const label = document.createElement('label');
    label.setAttribute('for', fieldId);
    label.innerHTML = field.name + (field.required ? ' <span class="required-star">*</span>' : '');
    if (field.helpText) {
        label.innerHTML += ` <span class="help-tip" title="${field.helpText}">?</span>`;
    }
    div.appendChild(label);

    let inputEl;
    switch (field.type) {
        case 'textarea':
            inputEl = document.createElement('textarea');
            inputEl.id = fieldId;
            inputEl.name = fieldId;
            inputEl.value = value;
            inputEl.rows = 3;
            break;
        case 'dropdown':
            inputEl = document.createElement('select');
            inputEl.id = fieldId;
            inputEl.name = fieldId;
            inputEl.innerHTML = '<option value="">Select...</option>';
            (field.options || []).forEach(opt => {
                inputEl.innerHTML += `<option value="${opt}" ${value === opt ? 'selected' : ''}>${opt}</option>`;
            });
            break;
        case 'checkbox':
            inputEl = document.createElement('div');
            inputEl.className = 'checkbox-field-wrapper';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.id = fieldId;
            cb.name = fieldId;
            cb.value = 'true';
            cb.checked = value === 'true' || value === true;
            const cbLabel = document.createElement('label');
            cbLabel.setAttribute('for', fieldId);
            cbLabel.textContent = 'Yes';
            cbLabel.className = 'checkbox-inline-label';
            inputEl.appendChild(cb);
            inputEl.appendChild(cbLabel);
            break;
        case 'radio':
            inputEl = document.createElement('div');
            inputEl.className = 'radio-field-wrapper';
            (field.options || []).forEach((opt, i) => {
                const radioId = `${fieldId}_${i}`;
                const rb = document.createElement('input');
                rb.type = 'radio';
                rb.name = fieldId;
                rb.id = radioId;
                rb.value = opt;
                rb.checked = value === opt;
                const rbLabel = document.createElement('label');
                rbLabel.setAttribute('for', radioId);
                rbLabel.textContent = opt;
                rbLabel.className = 'radio-inline-label';
                inputEl.appendChild(rb);
                inputEl.appendChild(rbLabel);
            });
            break;
        case 'file':
            inputEl = document.createElement('input');
            inputEl.type = 'file';
            inputEl.id = fieldId;
            inputEl.name = fieldId;
            if (value) {
                const existing = document.createElement('div');
                existing.className = 'file-existing';
                existing.innerHTML = `<span class="file-existing-name">Current: ${value}</span>`;
                div.appendChild(existing);
            }
            break;
        default: // text, number, date
            inputEl = document.createElement('input');
            inputEl.type = field.type === 'text' ? 'text' : field.type;
            inputEl.id = fieldId;
            inputEl.name = fieldId;
            inputEl.value = value;
            if (field.validation) {
                if (field.validation.minLength) inputEl.minLength = field.validation.minLength;
                if (field.validation.maxLength) inputEl.maxLength = field.validation.maxLength;
                if (field.validation.minValue !== undefined && field.validation.minValue !== null) inputEl.min = field.validation.minValue;
                if (field.validation.maxValue !== undefined && field.validation.maxValue !== null) inputEl.max = field.validation.maxValue;
                if (field.validation.minDate) inputEl.min = field.validation.minDate;
                if (field.validation.maxDate) inputEl.max = field.validation.maxDate;
            }
            break;
    }

    if (inputEl) {
        div.appendChild(inputEl);
        // Add change listener for dependency fields
        if (inputEl.tagName === 'SELECT' || inputEl.tagName === 'INPUT') {
            inputEl.addEventListener('change', () => applyFieldDependencies());
        }
    }

    // Validation error placeholder
    const errDiv = document.createElement('div');
    errDiv.className = 'field-error';
    errDiv.id = `error_${field.id}`;
    div.appendChild(errDiv);

    return div;
}

function applyFieldDependencies(memberData = null) {
    CUSTOM_FIELDS_CACHE.forEach(field => {
        if (!field.dependency || !field.dependency.fieldId) return;
        const wrapper = document.querySelector(`.custom-field-wrapper[data-custom-field-id="${field.id}"]`);
        if (!wrapper) return;

        const depFieldId = `custom_${field.dependency.fieldId}`;
        const depInput = document.getElementById(depFieldId) || document.querySelector(`[name="${depFieldId}"]`);
        let currentVal = '';
        if (depInput) {
            if (depInput.type === 'checkbox') currentVal = depInput.checked ? 'true' : 'false';
            else currentVal = depInput.value;
        }

        const shouldShow = currentVal === field.dependency.value;
        wrapper.style.display = shouldShow ? '' : 'none';
    });
}

async function openDetailModal(memberId) {
    const member = findMemberById(memberId, ALL_MEMBERS_CACHE);
    if (!member) return;

    const contentContainer = document.getElementById('detailed-view-content');
    document.getElementById('detail-modal-title').textContent = `${RANK_ABBREVIATIONS[member.rank] || ''} ${member.lastName}, ${member.firstName}`;
    
    const details = [];
    const supervisor = findMemberById(member.supervisor, ALL_MEMBERS_CACHE);
    const supervisorName = supervisor ? `${RANK_ABBREVIATIONS[supervisor.rank] || ''} ${supervisor.lastName}` : 'N/A';

    const flightObj = FLIGHTS_CACHE.find(f => f.id === member.flight);
    const flightName = flightObj ? flightObj.name : 'Unbilleted';

    details.push(`<strong>Flight:</strong><span>${flightName}</span>`);
    details.push(`<strong>Duty Title:</strong><span>${member.dutyTitle || 'N/A'}</span>`);
    details.push(`<strong>Team:</strong><span>${member.teamSelect?.replace('-container', '') || 'N/A'}</span>`);
    details.push(`<strong>Status:</strong><span>${member.status || 'N/A'}</span>`);
    details.push(`<strong>Supervisor:</strong><span>${supervisorName}</span>`);
    details.push(`<strong>TIS Date:</strong><span>${member.tisDate || 'N/A'}</span>`);
    details.push(`<strong>Date of Rank:</strong><span>${member.dorDate || 'N/A'}</span>`);
    details.push(`<strong>Hometown:</strong><span>${member.hometown || 'N/A'}</span>`);
    details.push(`<strong>Medical:</strong><span>${member.medicalProfile || 'N/A'}</span>`);
    if (member.promotionDate) {
        details.push(`<strong>Promotion Date:</strong><span>${member.promotionDate}</span>`);
    }

    if (member.customData && CUSTOM_FIELDS_CACHE) {
        const visibleFields = CUSTOM_FIELDS_CACHE.filter(f => f.visible !== false || CURRENT_ROLE === 'admin');
        const sorted = [...visibleFields].sort((a, b) => (a.order || 0) - (b.order || 0));
        sorted.forEach(field => {
            let value = member.customData[field.id];
            if (field.type === 'checkbox') value = value === 'true' || value === true ? 'Yes' : 'No';
            else if (field.type === 'file' && value) value = `<a href="#" class="file-link">${value}</a>`;
            else value = value || 'N/A';
            details.push(`<strong>${field.name}:</strong><span>${value}</span>`);
        });
    }

    contentContainer.innerHTML = details.join('');
    detailedViewModal.style.display = 'block';
}


function handleAssignmentChange() {
    const dutyTitle = dutyTitleSelect.value;
    const isLead = ['Flight Chief', 'Flight Commander'].includes(dutyTitle);
    document.getElementById('team-select-container').style.display = isLead ? 'none' : 'block';
    document.getElementById('status-container').style.display = isLead ? 'none' : 'block';
    document.getElementById('supervisor-fieldset').style.display = dutyTitle === 'Flight Commander' ? 'none' : 'block';
}

async function updateSupervisorDropdown(allMembers, currentMemberId = null) {
    if (!Array.isArray(allMembers)) return;
    const supervisorSelect = document.getElementById('supervisor');
    const existingValue = supervisorSelect.value;
    supervisorSelect.innerHTML = '<option value="">(None)</option>';
    allMembers.filter(m => m && m.rowId && SUPERVISOR_RANKS.includes(m.rank) && m.rowId !== currentMemberId).sort((a, b) => a.lastName.localeCompare(b.lastName)).forEach(sup => {
        const option = new Option(`${RANK_ABBREVIATIONS[sup.rank] || sup.rank} ${sup.lastName}, ${sup.firstName}`, sup.rowId);
        supervisorSelect.add(option);
    });
    supervisorSelect.value = existingValue;
}

// --- CUSTOM FIELD MANAGER LOGIC ---

const FIELD_TYPE_LABELS = {
    text: 'Text', textarea: 'Multi-line', number: 'Number', date: 'Date',
    dropdown: 'Dropdown', checkbox: 'Checkbox', radio: 'Radio', file: 'File'
};

async function openFieldManagerModal() {
    const [fields, groups] = await Promise.all([getCachedFields(true), getCachedGroups(true)]);
    CURRENT_ROLE = await getAccessRole();
    const roleSelect = document.getElementById('current-role-select');
    roleSelect.value = CURRENT_ROLE;
    updateRoleDescription();
    applyRoleRestrictions();
    renderGroupsList(groups);
    populateGroupDropdown(groups);
    populateDependencyDropdown(fields);
    await renderFieldManagerList();
    fieldsModal.style.display = 'block';
}

function updateRoleDescription() {
    const desc = document.getElementById('role-description');
    if (CURRENT_ROLE === 'admin') desc.textContent = 'Full access: create, edit, and delete fields.';
    else if (CURRENT_ROLE === 'manager') desc.textContent = 'View and use fields. Cannot modify or delete.';
    else desc.textContent = 'View-only access to custom fields.';
}

function applyRoleRestrictions() {
    const isAdmin = canManageFields();
    const addFieldset = document.getElementById('add-field-fieldset');
    const groupControls = document.getElementById('add-group-controls');
    if (addFieldset) addFieldset.style.display = isAdmin ? 'block' : 'none';
    if (groupControls) groupControls.style.display = isAdmin ? 'flex' : 'none';
}

function renderGroupsList(groups) {
    const container = document.getElementById('field-groups-list');
    container.innerHTML = '';
    if (groups.length === 0) {
        container.innerHTML = '<p class="empty-msg">No groups defined. Fields will appear ungrouped.</p>';
        return;
    }
    groups.forEach((group, index) => {
        const item = document.createElement('div');
        item.className = 'field-group-item';
        item.draggable = true;
        item.dataset.groupIndex = index;
        const isAdmin = canManageFields();
        item.innerHTML = `
            <span class="group-drag-handle" title="Drag to reorder">${isAdmin ? '⠿' : ''}</span>
            <span class="group-name" data-id="${group.id}">${group.name}</span>
            <span class="group-field-count">${countFieldsInGroup(group.id)} fields</span>
            ${isAdmin ? `<button class="rename-group-btn inline-btn-sm" data-id="${group.id}">Rename</button>
            <button class="delete-group-btn inline-btn-sm btn-danger-sm" data-id="${group.id}">Delete</button>` : ''}
        `;
        container.appendChild(item);
    });
    if (canManageFields()) setupGroupDragAndDrop(container);
}

function countFieldsInGroup(groupId) {
    return CUSTOM_FIELDS_CACHE.filter(f => f.group === groupId).length;
}

function setupGroupDragAndDrop(container) {
    let draggedIndex = null;
    container.querySelectorAll('.field-group-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            draggedIndex = parseInt(item.dataset.groupIndex);
            e.dataTransfer.effectAllowed = 'move';
            setTimeout(() => item.classList.add('dragging'), 0);
        });
        item.addEventListener('dragend', () => item.classList.remove('dragging'));
        item.addEventListener('dragover', (e) => e.preventDefault());
        item.addEventListener('drop', async (e) => {
            e.preventDefault();
            const targetIndex = parseInt(item.dataset.groupIndex);
            if (draggedIndex !== null && draggedIndex !== targetIndex) {
                const moved = FIELD_GROUPS_CACHE.splice(draggedIndex, 1)[0];
                FIELD_GROUPS_CACHE.splice(targetIndex, 0, moved);
                await saveFieldGroups(FIELD_GROUPS_CACHE);
                renderGroupsList(FIELD_GROUPS_CACHE);
                populateGroupDropdown(FIELD_GROUPS_CACHE);
            }
        });
    });
}

function populateGroupDropdown(groups) {
    const sel = document.getElementById('new-field-group');
    sel.innerHTML = '<option value="">(No Group)</option>';
    groups.forEach(g => {
        sel.innerHTML += `<option value="${g.id}">${g.name}</option>`;
    });
}

function populateDependencyDropdown(fields) {
    const sel = document.getElementById('new-field-dep-field');
    sel.innerHTML = '<option value="">(None - Always Visible)</option>';
    fields.forEach(f => {
        sel.innerHTML += `<option value="${f.id}">${f.name} (${FIELD_TYPE_LABELS[f.type] || f.type})</option>`;
    });
}

function toggleFieldTypeOptions() {
    const type = document.getElementById('new-field-type').value;
    document.getElementById('field-options-section').style.display = (type === 'dropdown' || type === 'radio') ? 'block' : 'none';
    document.getElementById('validation-text-rules').style.display = (type === 'text' || type === 'textarea') ? 'block' : 'none';
    document.getElementById('validation-number-rules').style.display = (type === 'number') ? 'block' : 'none';
    document.getElementById('validation-date-rules').style.display = (type === 'date') ? 'block' : 'none';
}

async function renderFieldManagerList() {
    const fields = await getCachedFields(true);
    const listContainer = document.getElementById('existing-fields-list');
    listContainer.innerHTML = '';
    if (fields.length === 0) {
        listContainer.innerHTML = '<p class="empty-msg">No custom fields defined yet.</p>';
        return;
    }

    const isAdmin = canManageFields();
    const sortedFields = [...fields].sort((a, b) => (a.order || 0) - (b.order || 0));

    sortedFields.forEach((field, index) => {
        const item = document.createElement('div');
        item.className = 'existing-field-item';
        item.draggable = isAdmin;
        item.dataset.fieldIndex = index;
        item.dataset.fieldId = field.id;

        const groupObj = FIELD_GROUPS_CACHE.find(g => g.id === field.group);
        const groupLabel = groupObj ? groupObj.name : '';
        const visLabel = field.visible === false ? '<span class="field-badge field-badge-hidden">Hidden</span>' : '';
        const reqLabel = field.required ? '<span class="field-badge field-badge-required">Required</span>' : '';
        const depLabel = field.dependency && field.dependency.fieldId ? '<span class="field-badge field-badge-dep">Conditional</span>' : '';

        item.innerHTML = `
            <div class="field-item-info">
                ${isAdmin ? '<span class="field-drag-handle" title="Drag to reorder">⠿</span>' : ''}
                <span class="field-item-name">${field.name}</span>
                <span class="field-type">${FIELD_TYPE_LABELS[field.type] || field.type}</span>
                ${groupLabel ? `<span class="field-badge field-badge-group">${groupLabel}</span>` : ''}
                ${visLabel}${reqLabel}${depLabel}
            </div>
            <div class="existing-field-item-controls">
                <label class="toggle-switch" title="Show on member card">
                    <input type="checkbox" class="show-on-card-toggle" data-id="${field.id}" ${field.showOnCard ? 'checked' : ''} ${!isAdmin ? 'disabled' : ''}>
                    <span class="slider"></span>
                </label>
                ${isAdmin ? `<button class="edit-field-btn inline-btn-sm" data-id="${field.id}">Edit</button>` : ''}
                ${isAdmin ? `<button class="delete-field-btn" data-id="${field.id}">Delete</button>` : ''}
            </div>
        `;
        listContainer.appendChild(item);
    });

    if (isAdmin) setupFieldDragAndDrop(listContainer);
}

function setupFieldDragAndDrop(container) {
    let draggedId = null;
    container.querySelectorAll('.existing-field-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            draggedId = item.dataset.fieldId;
            e.dataTransfer.effectAllowed = 'move';
            setTimeout(() => item.classList.add('dragging'), 0);
        });
        item.addEventListener('dragend', () => item.classList.remove('dragging'));
        item.addEventListener('dragover', (e) => e.preventDefault());
        item.addEventListener('drop', async (e) => {
            e.preventDefault();
            const targetId = item.dataset.fieldId;
            if (draggedId && draggedId !== targetId) {
                const draggedIdx = CUSTOM_FIELDS_CACHE.findIndex(f => f.id === draggedId);
                const targetIdx = CUSTOM_FIELDS_CACHE.findIndex(f => f.id === targetId);
                if (draggedIdx > -1 && targetIdx > -1) {
                    const moved = CUSTOM_FIELDS_CACHE.splice(draggedIdx, 1)[0];
                    CUSTOM_FIELDS_CACHE.splice(targetIdx, 0, moved);
                    CUSTOM_FIELDS_CACHE.forEach((f, i) => f.order = i);
                    await saveCustomFields(CUSTOM_FIELDS_CACHE);
                    await renderFieldManagerList();
                }
            }
        });
    });
}

function getOptionsFromForm() {
    const inputs = document.querySelectorAll('#field-options-list .field-option-input');
    return Array.from(inputs).map(i => i.value.trim()).filter(v => v);
}

async function handleAddFieldSubmit(event) {
    event.preventDefault();
    if (!canManageFields()) {
        await customAlert("You don't have permission to add fields.", "Access Denied");
        return;
    }

    const name = document.getElementById('new-field-name').value.trim();
    const type = document.getElementById('new-field-type').value;

    if (!name) {
        await customAlert("Field name cannot be empty.", "Validation");
        return;
    }

    const newField = {
        id: `field_${Date.now()}`,
        name,
        type,
        group: document.getElementById('new-field-group').value || '',
        order: CUSTOM_FIELDS_CACHE.length,
        showOnCard: document.getElementById('new-field-show-card').checked,
        visible: document.getElementById('new-field-visible').checked,
        cardDisplay: document.getElementById('new-field-card-display').value,
        helpText: document.getElementById('new-field-help-text').value.trim(),
        required: document.getElementById('new-field-required').checked,
        validation: {},
        options: [],
        dependency: null
    };

    // Collect options for dropdown/radio
    if (type === 'dropdown' || type === 'radio') {
        newField.options = getOptionsFromForm();
        if (newField.options.length < 2) {
            await customAlert("Dropdown and Radio fields need at least 2 options.", "Validation");
            return;
        }
    }

    // Collect validation rules
    if (type === 'text' || type === 'textarea') {
        const minLen = document.getElementById('new-field-min-length').value;
        const maxLen = document.getElementById('new-field-max-length').value;
        const regex = document.getElementById('new-field-regex').value.trim();
        const regexMsg = document.getElementById('new-field-regex-msg').value.trim();
        if (minLen) newField.validation.minLength = parseInt(minLen);
        if (maxLen) newField.validation.maxLength = parseInt(maxLen);
        if (regex) { newField.validation.regex = regex; newField.validation.regexMessage = regexMsg || 'Invalid format.'; }
    }
    if (type === 'number') {
        const minVal = document.getElementById('new-field-min-value').value;
        const maxVal = document.getElementById('new-field-max-value').value;
        if (minVal !== '') newField.validation.minValue = parseFloat(minVal);
        if (maxVal !== '') newField.validation.maxValue = parseFloat(maxVal);
    }
    if (type === 'date') {
        const minDate = document.getElementById('new-field-min-date').value;
        const maxDate = document.getElementById('new-field-max-date').value;
        if (minDate) newField.validation.minDate = minDate;
        if (maxDate) newField.validation.maxDate = maxDate;
    }

    // Dependency
    const depField = document.getElementById('new-field-dep-field').value;
    const depValue = document.getElementById('new-field-dep-value').value.trim();
    if (depField) {
        newField.dependency = { fieldId: depField, value: depValue };
    }

    const updatedFields = [...CUSTOM_FIELDS_CACHE, newField];
    await saveCustomFields(updatedFields);
    populateDependencyDropdown(updatedFields);
    await renderFieldManagerList();
    addFieldForm.reset();
    toggleFieldTypeOptions();
    // Reset options list
    document.getElementById('field-options-list').innerHTML =
        '<input type="text" class="field-option-input" placeholder="Option 1"><input type="text" class="field-option-input" placeholder="Option 2">';
}

async function handleFieldListClick(event) {
    const target = event.target;
    const fieldId = target.dataset?.id;
    if (!fieldId) return;

    if (target.matches('.delete-field-btn')) {
        if (!canManageFields()) return;
        if (await customConfirm("Are you sure you want to delete this field? This cannot be undone.", "Delete Field", "Delete")) {
            const updatedFields = CUSTOM_FIELDS_CACHE.filter(f => f.id !== fieldId);
            await saveCustomFields(updatedFields);
            populateDependencyDropdown(updatedFields);
            await renderFieldManagerList();
            await renderAll(true);
        }
    } else if (target.matches('.show-on-card-toggle')) {
        if (!canManageFields()) { target.checked = !target.checked; return; }
        const field = CUSTOM_FIELDS_CACHE.find(f => f.id === fieldId);
        if (field) {
            field.showOnCard = target.checked;
            await saveCustomFields(CUSTOM_FIELDS_CACHE);
            await renderAll(true);
        }
    } else if (target.matches('.edit-field-btn')) {
        if (!canManageFields()) return;
        await openEditFieldDialog(fieldId);
    }
}

async function openEditFieldDialog(fieldId) {
    const field = CUSTOM_FIELDS_CACHE.find(f => f.id === fieldId);
    if (!field) return;
    const newName = await customPrompt("Edit field name:", field.name, "Edit Field");
    if (newName === null) return;
    if (!newName.trim()) {
        await customAlert("Field name cannot be empty.", "Validation");
        return;
    }
    field.name = newName.trim();
    await saveCustomFields(CUSTOM_FIELDS_CACHE);
    await renderFieldManagerList();
    await renderAll(true);
}

async function handleAddGroup() {
    if (!canManageFields()) return;
    const nameInput = document.getElementById('new-group-name');
    const name = nameInput.value.trim();
    if (!name) {
        await customAlert("Group name cannot be empty.", "Validation");
        return;
    }
    const newGroup = { id: `group_${Date.now()}`, name, order: FIELD_GROUPS_CACHE.length };
    const updated = [...FIELD_GROUPS_CACHE, newGroup];
    await saveFieldGroups(updated);
    renderGroupsList(updated);
    populateGroupDropdown(updated);
    nameInput.value = '';
}

async function handleGroupsClick(event) {
    const target = event.target;
    const groupId = target.dataset?.id;
    if (!groupId || !canManageFields()) return;

    if (target.matches('.delete-group-btn')) {
        if (await customConfirm("Delete this group? Fields in this group will become ungrouped.", "Delete Group", "Delete")) {
            CUSTOM_FIELDS_CACHE.forEach(f => { if (f.group === groupId) f.group = ''; });
            await saveCustomFields(CUSTOM_FIELDS_CACHE);
            const updated = FIELD_GROUPS_CACHE.filter(g => g.id !== groupId);
            await saveFieldGroups(updated);
            renderGroupsList(updated);
            populateGroupDropdown(updated);
            await renderFieldManagerList();
        }
    } else if (target.matches('.rename-group-btn')) {
        const group = FIELD_GROUPS_CACHE.find(g => g.id === groupId);
        if (!group) return;
        const newName = await customPrompt("Rename group:", group.name, "Rename Group");
        if (newName === null || !newName.trim()) return;
        group.name = newName.trim();
        await saveFieldGroups(FIELD_GROUPS_CACHE);
        renderGroupsList(FIELD_GROUPS_CACHE);
        populateGroupDropdown(FIELD_GROUPS_CACHE);
        await renderFieldManagerList();
    }
}

// --- CUSTOM FIELD VALIDATION ---
function validateCustomField(field, value) {
    const errors = [];
    if (field.required && (!value || (typeof value === 'string' && !value.trim()))) {
        errors.push(`${field.name} is required.`);
        return errors;
    }
    if (!value && !field.required) return errors;

    const v = field.validation || {};
    if ((field.type === 'text' || field.type === 'textarea') && typeof value === 'string') {
        if (v.minLength && value.length < v.minLength) errors.push(`${field.name} must be at least ${v.minLength} characters.`);
        if (v.maxLength && value.length > v.maxLength) errors.push(`${field.name} must be at most ${v.maxLength} characters.`);
        if (v.regex) {
            try {
                if (!new RegExp(v.regex).test(value)) errors.push(v.regexMessage || `${field.name} has invalid format.`);
            } catch (e) { /* invalid regex stored, skip */ }
        }
    }
    if (field.type === 'number' && value !== '') {
        const num = parseFloat(value);
        if (isNaN(num)) { errors.push(`${field.name} must be a number.`); return errors; }
        if (v.minValue !== undefined && v.minValue !== null && num < v.minValue) errors.push(`${field.name} must be at least ${v.minValue}.`);
        if (v.maxValue !== undefined && v.maxValue !== null && num > v.maxValue) errors.push(`${field.name} must be at most ${v.maxValue}.`);
    }
    if (field.type === 'date' && value) {
        if (v.minDate && value < v.minDate) errors.push(`${field.name} cannot be before ${v.minDate}.`);
        if (v.maxDate && value > v.maxDate) errors.push(`${field.name} cannot be after ${v.maxDate}.`);
    }
    return errors;
}


// --- EVENT HANDLERS ---
function getDraggableCard(event) {
    return event.target.closest('.member-card, .chart-card, .chart-card-supervisor');
}

let activeDragImage = null;

function clearDragImage() {
    if (activeDragImage) {
        activeDragImage.remove();
        activeDragImage = null;
    }
}

function setCustomDragImage(card, event) {
    if (!event.dataTransfer) return;
    clearDragImage();
    const dragImage = card.cloneNode(true);
    dragImage.classList.remove('expanded', 'dragging');
    dragImage.classList.add('drag-preview');
    if (dragImage.classList.contains('member-card')) {
        const body = dragImage.querySelector('.card-body');
        if (body) {
            body.style.display = 'none';
            body.style.padding = '0';
            body.style.maxHeight = '0';
            body.style.overflow = 'hidden';
        }
        dragImage.querySelectorAll('.context-menu.show').forEach(menu => menu.classList.remove('show'));
    }
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    dragImage.style.left = '-1000px';
    dragImage.style.opacity = '1';
    dragImage.style.pointerEvents = 'none';
    dragImage.style.transform = 'none';
    dragImage.style.width = `${card.offsetWidth}px`;
    document.body.appendChild(dragImage);

    const rect = card.getBoundingClientRect();
    const offsetX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const offsetY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    event.dataTransfer.setDragImage(dragImage, offsetX, offsetY);
    activeDragImage = dragImage;
}

function handleTeamCardDragOver(event) {
    event.preventDefault();
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
    }
    const container = event.currentTarget.closest('.team-container');
    if (container) {
        container.classList.add('drag-over');
    }
}

function handleDragStart(event) {
    const card = getDraggableCard(event);
    if (card && event.dataTransfer) {
        event.dataTransfer.setData('text/plain', card.id);
        event.dataTransfer.effectAllowed = 'move';
        setCustomDragImage(card, event);
        setTimeout(() => card.classList.add('dragging'), 0);
    }
}

function handleDragEnd(event) {
    const card = getDraggableCard(event);
    if (card) {
        card.classList.remove('dragging');
    }
    clearDragImage();
}

async function handleFormSubmit(event) {
    event.preventDefault();
    const formData = new FormData(addMemberForm);
    const memberData = Object.fromEntries(formData.entries());
    const isEditing = !!document.getElementById('edit-row-id').value;

    if (!isEditing) {
        memberData.rowId = `card-${Date.now()}`;
    }

    // Validate custom fields
    const allErrors = [];
    for (const field of CUSTOM_FIELDS_CACHE) {
        const key = `custom_${field.id}`;
        let value = memberData[key] || '';
        // Handle checkbox (unchecked checkboxes aren't in FormData)
        if (field.type === 'checkbox') {
            const cb = document.getElementById(key);
            value = cb && cb.checked ? 'true' : 'false';
            memberData[key] = value;
        }
        // Handle radio
        if (field.type === 'radio') {
            const selected = document.querySelector(`input[name="${key}"]:checked`);
            value = selected ? selected.value : '';
            memberData[key] = value;
        }
        // Handle file (store filename only)
        if (field.type === 'file') {
            const fileInput = document.getElementById(key);
            if (fileInput && fileInput.files.length > 0) {
                memberData[key] = fileInput.files[0].name;
            } else {
                delete memberData[key]; // Keep existing value
            }
        }
        const errors = validateCustomField(field, value);
        if (errors.length > 0) {
            allErrors.push(...errors);
            const errEl = document.getElementById(`error_${field.id}`);
            if (errEl) { errEl.textContent = errors[0]; errEl.style.display = 'block'; }
        } else {
            const errEl = document.getElementById(`error_${field.id}`);
            if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
        }
    }
    if (allErrors.length > 0) {
        await customAlert(allErrors.join('\n'), 'Validation Errors');
        return;
    }

    if (['Flight Chief', 'Flight Commander'].includes(memberData.dutyTitle)) {
        memberData.teamSelect = 'flight-leads-container';
        memberData.status = '';
    } else if (!memberData.teamSelect) {
        memberData.teamSelect = 'inbound-container';
    }

    if (memberData.dutyTitle === 'Flight Commander') memberData.supervisor = '';

    await saveMember(memberData, isEditing);
    await renderAll(true);
    memberModal.style.display = 'none';
}

async function handleDrop(event) {
    event.preventDefault();
    const container = event.currentTarget.classList.contains('team-container')
        ? event.currentTarget
        : event.currentTarget.closest('.team-container');
    if (!container) return;
    container.classList.remove('drag-over');
    const cardId = event.dataTransfer.getData('text/plain');
    const member = findMemberById(cardId, await getCachedMembers());
    
    if (member && container.id !== member.teamSelect) {
        const oldTeamName = member.teamSelect.replace('-container', '');
        const newTeamName = container.id.replace('-container', '');
        member.teamSelect = container.id;
        
        const oldTeamRef = database.ref(oldTeamName);
        const newTeamRef = database.ref(newTeamName);
        try {
            const [oldTeamSnapshot, newTeamSnapshot] = await Promise.all([oldTeamRef.get(), newTeamRef.get()]);
            const oldTeamArray = oldTeamSnapshot.exists() && Array.isArray(oldTeamSnapshot.val()) ? oldTeamSnapshot.val().filter(m=>m) : [];
            const newTeamArray = newTeamSnapshot.exists() && Array.isArray(newTeamSnapshot.val()) ? newTeamSnapshot.val().filter(m=>m) : [];
            
            const finalOldTeam = oldTeamArray.filter(m => m.rowId !== member.rowId);
            newTeamArray.push(member);

            const updates = {};
            updates[oldTeamName] = finalOldTeam;
            updates[newTeamName] = newTeamArray;
            
            await database.ref().update(updates);
            await renderAll(true);
        } catch (error) {
            console.error("Error moving member:", error);
            customAlert("An error occurred while moving the member.", "Error");
        }
    }
}

async function handleChartDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    const supervisorCard = event.currentTarget.querySelector('.chart-card, .chart-card-supervisor');
    if (!supervisorCard) return;
    const supervisorId = supervisorCard.id;
    const superviseeId = event.dataTransfer.getData('text/plain');
    if (!superviseeId || !supervisorId || superviseeId === supervisorId) return;

    const supervisee = findMemberById(superviseeId, await getCachedMembers());
    if (supervisee && supervisee.supervisor !== supervisorId) {
        supervisee.supervisor = supervisorId;
        supervisee.supStartDate = new Date().toISOString().slice(0, 10);
        await saveMember(supervisee, true);
        await renderAll(true);
    }
}

async function handleCardActions(event) {
    const card = event.target.closest('.member-card');
    if (!card) return;

    const target = event.target;

    // --- MODIFIED HAMBURGER LOGIC ---
    if (target.matches('.hamburger-menu')) {
        event.stopPropagation(); // Prevents the global click listener from immediately closing it
        const contextMenu = target.nextElementSibling;
        const isAlreadyOpen = contextMenu.classList.contains('show');
        
        // First, close all other context menus on the page
        document.querySelectorAll('.context-menu.show').forEach(menu => {
            menu.classList.remove('show');
        });

        // If the clicked menu wasn't already open, open it.
        if (!isAlreadyOpen) {
            contextMenu.classList.add('show');
        }
        return;
    }
    
    if (target.closest('.context-menu')) {
        if (target.matches('.detail-btn')) {
            openDetailModal(card.id);
        }
        if (target.matches('.modify-btn')) {
            openEditModal(card.id);
        }
        if (target.matches('.delete-btn')) {
            const memberData = findMemberById(card.id, ALL_MEMBERS_CACHE);
            if(memberData) deleteMember(memberData);
        }
        // After an action, close the menu
        target.closest('.context-menu').classList.remove('show');
        return; 
    }
    
    if (target.matches('.selection-btn')) {
        const memberData = findMemberById(card.id, ALL_MEMBERS_CACHE);
        if (!memberData) return;

        if (target.dataset.action === 'selected') {
            const promoDate = await customPrompt("Enter Promotion Date (YYYY-MM-DD):", "", "Promotion Date");
            if (!promoDate || !/^\d{4}-\d{2}-\d{2}$/.test(promoDate)) {
                if (promoDate !== null) await customAlert("Invalid date format. Please use YYYY-MM-DD.", "Invalid Date");
                return;
            }
            memberData.promotionStatus = 'selected';
            memberData.promotionDate = promoDate;
        } else if (target.dataset.action === 'not-selected') {
            memberData.promotionStatus = 'not-selected';
            memberData.promotionDate = '';
        } else if (target.classList.contains('edit-promo-date-btn')) {
            const newDate = await customPrompt("Edit Promotion Date (YYYY-MM-DD):", memberData.promotionDate || "", "Edit Promotion Date");
            if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
                if (newDate !== null) await customAlert("Invalid date format. Please use YYYY-MM-DD.", "Invalid Date");
                return;
            }
            memberData.promotionDate = newDate;
        }

        await saveMember(memberData, true);
        await renderAll(true);
        return;
    }

    if (target.matches('.promote-btn') || target.matches('.btz-action-btn')) {
        const memberData = findMemberById(card.id, ALL_MEMBERS_CACHE);
        if(!memberData) return;

        if (target.matches('.promote-btn')) {
            const newDor = await customPrompt("Enter new Date of Rank (YYYY-MM-DD):", new Date().toISOString().slice(0, 10), "New Date of Rank");
            if (!newDor || !/^\d{4}-\d{2}-\d{2}$/.test(newDor)) {
                if (newDor !== null) await customAlert("Invalid date format. Please use YYYY-MM-DD.", "Invalid Date");
                return;
            }
            const currentRankIndex = PROMOTION_SEQUENCE.indexOf(memberData.rank);
            if (currentRankIndex > -1 && currentRankIndex < PROMOTION_SEQUENCE.length - 1) {
                memberData.rank = PROMOTION_SEQUENCE[currentRankIndex + 1];
                memberData.dorDate = newDor;
                await saveMember(memberData, true);
                await renderAll(true);
            } else {
                await customAlert("Max rank reached or invalid current rank for promotion sequence.", "Cannot Promote");
            }
        } else { // BTZ action
            const action = target.dataset.action;
            if (action === 'selected') {
                memberData.btzStatus = 'selected';
                memberData.originalDor = memberData.dorDate;
                memberData.dorDate = target.dataset.newDor;
                memberData.rank = 'E-4';
            } else {
                memberData.btzStatus = 'not-selected';
            }
            await saveMember(memberData, true);
            await renderAll(true);
        }
        return;
    }

    // This handles the card expand/collapse, but only if not clicking the menu itself
    if (target.closest('.card-header')) {
        card.classList.toggle('expanded');
    }
}

// --- SUPERVISION CHART LOGIC ---
function buildChartTree(members) {
    if (!Array.isArray(members)) return [];

    const memberMap = new Map();
    // Use a temporary clone to avoid circular references in the objects
    members.forEach(m => {
        if (m && m.rowId) {
            memberMap.set(m.rowId, { ...m, children: [] });
        }
    });

    const roots = [];
    memberMap.forEach(node => {
        if (node.supervisor && memberMap.has(node.supervisor)) {
            memberMap.get(node.supervisor).children.push(node);
        } else {
            roots.push(node);
        }
    });
    return roots;
}

function createChartNode(node) {
    const isSupervisor = SUPERVISOR_RANKS.includes(node.rank);
    const cardStyleClass = isSupervisor ? 'chart-card-supervisor' : 'chart-card chart-card-compact';
    const teamName = node.teamSelect ? node.teamSelect.replace('-container', '') : '';
    const teamClass = teamName ? `chart-team-${teamName}` : '';
    const rankDisplay = RANK_ABBREVIATIONS[node.rank] || '';
    const cardHTML = `<div class="${cardStyleClass} ${teamClass}" id="${node.rowId}" draggable="true"><div class="chart-card-name">${rankDisplay} ${node.lastName}</div>${isSupervisor ? `<div class="chart-card-title">${node.dutyTitle || ''}</div>` : ''}</div>`;
    
    let childrenHTML = '';
    if (node.children && node.children.length > 0) {
        node.children.sort((a, b) => (RANK_ORDER[b.rank] || 0) - (RANK_ORDER[a.rank] || 0));
        childrenHTML = `<ul class="chart-children">${node.children.map(createChartNode).join('')}</ul>`;
    }
    return `<li>${cardHTML}${childrenHTML}</li>`;
}

function renderSupervisionChart(allMembers) {
    const supervisionContainer = document.getElementById('supervision-view');
    try {
        if (!allMembers || allMembers.length === 0) {
            supervisionContainer.innerHTML = '<p>No members to display.</p>';
            return;
        }
        const roots = buildChartTree(allMembers).sort((a, b) => (RANK_ORDER[b.rank] || 0) - (RANK_ORDER[a.rank] || 0));
        if (roots.length === 0 && allMembers.length > 0) {
            supervisionContainer.innerHTML = '<p>No top-level supervisors found. Check for circular supervision assignments.</p>';
            return;
        }
        if (roots.length === 0) {
            supervisionContainer.innerHTML = '<p>No members to display in chart.</p>';
            return;
        }
        supervisionContainer.innerHTML = `<div class="chart-container"><ul class="chart-children">${roots.map(createChartNode).join('')}</ul></div>`;
        supervisionContainer.querySelectorAll('[draggable="true"]').forEach(el => {
            el.addEventListener('dragstart', handleDragStart);
            el.addEventListener('dragend', handleDragEnd);
        });
        supervisionContainer.querySelectorAll('li').forEach(el => {
            el.addEventListener('dragover', (e) => e.preventDefault());
            el.addEventListener('drop', handleChartDrop);
        });
    } catch (error) {
        console.error("Failed to render supervision chart:", error);
        supervisionContainer.innerHTML = `<p style="color: #ff8a8a;">Error: Could not display supervision chart. Please check console for details.</p>`;
    }
}

// --- PROMOTION CALCULATION LOGIC ---
function calculatePromotionEligibility(member) {
    const { rank, tisDate, dorDate, btzStatus } = member;
    if (!tisDate || !dorDate) {
        if (rank && rank.startsWith('O-')) return { status: "Officer Rank", note: "Manual tracking.", className: "manual-review" };
        return { status: "Info Needed", note: "Enter TIS and DOR.", className: "info-needed" };
    }
    if (btzStatus === 'selected') return { status: `BTZ Select!`, note: `New DOR: ${dorDate}`, className: 'btz-select' };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthsTIS = getMonthsDifference(new Date(tisDate), today);
    const monthsTIG = getMonthsDifference(new Date(dorDate), today);
    const getQuarterValue = (q) => q.year * 4 + q.quarter;

    switch (rank) {
        case 'E-1':
            if (monthsTIS >= 6 && monthsTIG >= 6) return { status: "Auto-Promoted to E-2", note: "TIS/TIG met.", className: "eligible" };
            return { status: "Not Eligible", note: "Req: 6m TIS/TIG.", className: "not-eligible" };
        case 'E-2':
            if (monthsTIG >= 10) return { status: "Auto-Promoted to E-3", note: "TIG met.", className: "eligible" };
            return { status: "Not Eligible", note: "Req: 10m TIG.", className: "not-eligible" };
        
        case 'E-3':
            const tisPathDate = new Date(tisDate);
            tisPathDate.setMonth(tisPathDate.getMonth() + 36);
            const tigPathDate = new Date(dorDate);
            tigPathDate.setMonth(tigPathDate.getMonth() + 28);
            const standardPromoDateRaw = (tisPathDate < tigPathDate) ? tisPathDate : tigPathDate;

            // Add 1 day because they must COMPLETE the anniversary day before promoting
            const standardPromoDate = new Date(standardPromoDateRaw);
            standardPromoDate.setDate(standardPromoDate.getDate() + 1);

            const btzPromoDateRaw = new Date(standardPromoDateRaw);
            btzPromoDateRaw.setMonth(btzPromoDateRaw.getMonth() - 6);

            // Add 1 day to BTZ promo date as well
            const btzPromoDate = new Date(btzPromoDateRaw);
            btzPromoDate.setDate(btzPromoDate.getDate() + 1);

            const currentQuarter = getQuarterInfo(today);
            const btzPromoQuarter = getQuarterInfo(btzPromoDate);
            const boardQuarter = getPreviousQuarterInfo(btzPromoQuarter);

            const nextQuarter = getNextQuarterInfo(currentQuarter);
            const twoQuartersOut = getNextQuarterInfo(nextQuarter); // Calculate two quarters from now

            const currentQuarterValue = getQuarterValue(currentQuarter);
            const boardQuarterValue = getQuarterValue(boardQuarter);

            if (btzStatus === 'not-selected') {
                if (today >= standardPromoDate) return { status: "Auto-Promoted to E-4", note: "Standard TIS/TIG met.", className: "eligible" };
                return { status: "Not Selected for BTZ", note: `Will auto-promote on ${standardPromoDate.toLocaleDateString()}`, className: "btz-not-selected" };
            }

            // New check for two quarters out (Yellow '!')
            if (boardQuarter.year === twoQuartersOut.year && boardQuarter.quarter === twoQuartersOut.quarter) {
                return { status: `BTZ Board in 2 Quarters`, note: `Board for Q${boardQuarter.quarter} ${boardQuarter.year}`, className: "btz-two-q" };
            }
            // Check for next quarter (Red '!')
            if (boardQuarter.year === nextQuarter.year && boardQuarter.quarter === nextQuarter.quarter) {
                return { status: `BTZ Board Next Quarter!`, note: `Board for Q${boardQuarter.quarter} ${boardQuarter.year}`, className: "btz-next-q" };
            }
            // Check if IN the board quarter (Red '!' - persistent until selection made)
            if (currentQuarterValue === boardQuarterValue) {
                return { status: `BTZ Board THIS Quarter!`, note: `Board for Q${boardQuarter.quarter} ${boardQuarter.year} - Make selection`, className: "btz-this-q", btzPromoDate: btzPromoDate.toISOString().slice(0, 10) };
            }
            if (currentQuarterValue > boardQuarterValue) return { status: "Board Concluded", note: `Board was Q${boardQuarter.quarter} ${boardQuarter.year}`, className: "board-concluded", btzPromoDate: btzPromoDate.toISOString().slice(0, 10) };
            return { status: "Not Eligible", note: `BTZ board: Q${boardQuarter.quarter} ${boardQuarter.year}`, className: "not-eligible" };

        case 'E-4':
            if (member.promotionStatus === 'selected' && member.promotionDate) {
                return { status: "Selected for E-5", note: `Promotes: ${member.promotionDate}`, className: "promo-selected" };
            }
            if (member.promotionStatus === 'not-selected') {
                return { status: "Not Selected for E-5", note: "Can compete next cycle.", className: "promo-not-selected" };
            }
            if (monthsTIS >= 36 && monthsTIG >= 6) return { status: "Board Eligible for E-5", note: "TIS/TIG met for SSgt board.", className: "promo-eligible" };
            return { status: "Not Eligible", note: "Req: 36m TIS & 6m TIG.", className: "not-eligible" };
        case 'E-5':
            if (member.promotionStatus === 'selected' && member.promotionDate) {
                return { status: "Selected for E-6", note: `Promotes: ${member.promotionDate}`, className: "promo-selected" };
            }
            if (member.promotionStatus === 'not-selected') {
                return { status: "Not Selected for E-6", note: "Can compete next cycle.", className: "promo-not-selected" };
            }
            if (monthsTIS >= 60 && monthsTIG >= 23) return { status: "Board Eligible for E-6", note: "TIS/TIG met for TSgt board.", className: "promo-eligible" };
            return { status: "Not Eligible", note: "Req: 60m TIS & 23m TIG.", className: "not-eligible" };
        case 'E-6':
            if (member.promotionStatus === 'selected' && member.promotionDate) {
                return { status: "Selected for E-7", note: `Promotes: ${member.promotionDate}`, className: "promo-selected" };
            }
            if (member.promotionStatus === 'not-selected') {
                return { status: "Not Selected for E-7", note: "Can compete next cycle.", className: "promo-not-selected" };
            }
            if (monthsTIS >= 96 && monthsTIG >= 24) return { status: "Board Eligible for E-7", note: "TIS/TIG met for MSgt board.", className: "promo-eligible" };
            return { status: "Not Eligible", note: "Req: 96m TIS & 24m TIG.", className: "not-eligible" };
        case 'E-7':
            if (member.promotionStatus === 'selected' && member.promotionDate) {
                return { status: "Selected for E-8", note: `Promotes: ${member.promotionDate}`, className: "promo-selected" };
            }
            if (member.promotionStatus === 'not-selected') {
                return { status: "Not Selected for E-8", note: "Can compete next cycle.", className: "promo-not-selected" };
            }
            if (monthsTIS >= 132 && monthsTIG >= 20) return { status: "Board Eligible for E-8", note: "TIS/TIG met for SMSgt board.", className: "promo-eligible" };
            return { status: "Not Eligible", note: "Req: 132m TIS & 20m TIG.", className: "not-eligible" };
        case 'E-8':
            if (member.promotionStatus === 'selected' && member.promotionDate) {
                return { status: "Selected for E-9", note: `Promotes: ${member.promotionDate}`, className: "promo-selected" };
            }
            if (member.promotionStatus === 'not-selected') {
                return { status: "Not Selected for E-9", note: "Can compete next cycle.", className: "promo-not-selected" };
            }
            if (monthsTIS >= 168 && monthsTIG >= 21) return { status: "Board Eligible for E-9", note: "TIS/TIG met for CMSgt board.", className: "promo-eligible" };
            return { status: "Not Eligible", note: "Req: 168m TIS & 21m TIG.", className: "not-eligible" };
        case 'E-9':
            return { status: "Chief!", note: "Highest enlisted rank.", className: "manual-review" };
        default:
            return { status: "Review Manually", note: "", className: "manual-review" };
    }
}

function getQuarterInfo(d) {
    const m = d.getMonth();
    if (m < 3) return { quarter: 1, year: d.getFullYear() };
    if (m < 6) return { quarter: 2, year: d.getFullYear() };
    if (m < 9) return { quarter: 3, year: d.getFullYear() };
    return { quarter: 4, year: d.getFullYear() };
}

function getPreviousQuarterInfo(q) {
    return q.quarter === 1 ? { quarter: 4, year: q.year - 1 } : { quarter: q.quarter - 1, year: q.year };
}

function getNextQuarterInfo(q) {
    return q.quarter === 4 ? { quarter: 1, year: q.year + 1 } : { quarter: q.quarter + 1, year: q.year };
}

// --- GLOBAL EVENT LISTENERS ---

document.getElementById('add-member-btn').addEventListener('click', openAddModal);
memberModal.querySelector('.close-btn').addEventListener('click', () => memberModal.style.display = 'none');
addMemberForm.addEventListener('submit', handleFormSubmit);
dutyTitleSelect.addEventListener('change', handleAssignmentChange);

document.getElementById('manage-fields-btn').addEventListener('click', openFieldManagerModal);
fieldsModal.querySelector('.close-btn').addEventListener('click', () => fieldsModal.style.display = 'none');
addFieldForm.addEventListener('submit', handleAddFieldSubmit);
document.getElementById('existing-fields-list').addEventListener('click', handleFieldListClick);

// Field type change toggles validation/options sections
document.getElementById('new-field-type').addEventListener('change', toggleFieldTypeOptions);

// Add option button for dropdown/radio
document.getElementById('add-option-btn').addEventListener('click', () => {
    const list = document.getElementById('field-options-list');
    const count = list.querySelectorAll('.field-option-input').length;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'field-option-input';
    input.placeholder = `Option ${count + 1}`;
    list.appendChild(input);
});

// Dependency field change
document.getElementById('new-field-dep-field').addEventListener('change', (e) => {
    const depValueInput = document.getElementById('new-field-dep-value');
    depValueInput.disabled = !e.target.value;
});

// Add group button
document.getElementById('add-group-btn').addEventListener('click', handleAddGroup);
document.getElementById('field-groups-list').addEventListener('click', handleGroupsClick);

// Role select
document.getElementById('current-role-select').addEventListener('change', async (e) => {
    await saveAccessRole(e.target.value);
    updateRoleDescription();
    applyRoleRestrictions();
    await renderFieldManagerList();
});

detailedViewModal.querySelector('.close-btn').addEventListener('click', () => detailedViewModal.style.display = 'none');

document.getElementById('sub-tab-nav').addEventListener('click', async (event) => {
    if (!event.target.matches('.tab-btn')) return;

    const tabId = event.target.dataset.tab;

    // Update sub-tab active states
    document.querySelectorAll('#sub-tab-nav .tab-btn').forEach(el => el.classList.remove('active'));
    event.target.classList.add('active');

    // Hide all main tab content, then show the active one
    document.querySelectorAll('#main-content > .tab-content').forEach(el => el.classList.remove('active'));
    const activeContent = document.getElementById(tabId);
    activeContent.classList.add('active');

    // Render supervision chart if needed
    if (tabId === 'supervision-view') {
        const allMembers = await getCachedMembers();
        const flightMembers = allMembers.filter(m => m.flight === activeFlightId);
        renderSupervisionChart(flightMembers);
    }
});

document.addEventListener('click', function (event) {
    // If the click is not inside a context menu and not the hamburger itself
    if (!event.target.closest('.context-menu') && !event.target.closest('.hamburger-menu')) {
        // Close any open context menus
        document.querySelectorAll('.context-menu.show').forEach(menu => {
            menu.classList.remove('show');
        });
    }
});

TEAM_CONTAINERS.forEach(id => {
    const container = document.getElementById(id);
    if (container) {
        container.addEventListener('dragover', (e) => e.preventDefault());
        container.addEventListener('dragenter', (e) => {
            e.preventDefault();
            container.classList.add('drag-over');
        });
        container.addEventListener('dragleave', (e) => container.classList.remove('drag-over'));
        container.addEventListener('drop', handleDrop);
    }
});

// --- INITIAL LOAD ---
document.addEventListener('DOMContentLoaded', async () => {
    CURRENT_ROLE = await getAccessRole();
    renderAll(true);
});
