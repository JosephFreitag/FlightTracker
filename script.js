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
        alert("Failed to load data from Firebase. Check console for errors.");
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
        alert("There was an error saving the member. Please try again.");
    }
}

async function deleteMember(memberData) {
    if (!confirm(`Are you sure you want to permanently delete ${memberData.lastName}?`)) return;
    const allMembers = await getCachedMembers();
    if (allMembers.some(m => m.supervisor === memberData.rowId)) {
        return alert(`Cannot delete ${memberData.lastName}. Please re-assign their supervisee(s) first.`);
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
        alert("There was an error deleting the member. Please try again.");
    }
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
    const [allMembers, customFields] = await Promise.all([
        getCachedMembers(forceRefresh),
        getCachedFields(forceRefresh)
    ]);

    TEAM_CONTAINERS.forEach(id => {
        const container = document.getElementById(id);
        if (container) container.innerHTML = '';
    });

    if (Array.isArray(allMembers)) {
        allMembers.sort((a, b) => (RANK_ORDER[b.rank] || 0) - (RANK_ORDER[a.rank] || 0) || a.lastName.localeCompare(b.lastName));

        for (const member of allMembers) {
            if (member && member.teamSelect) {
                const container = document.getElementById(member.teamSelect);
                if (container) {
                    container.appendChild(createMemberCardElement(member, allMembers, customFields));
                }
            }
        }
    }

    await updateSupervisorDropdown(allMembers);
    const activeTab = document.querySelector('.tab-btn.active');
    if (activeTab && activeTab.dataset.tab === 'supervision-view') {
        renderSupervisionChart(allMembers);
    }
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
    
    let statusTagHTML = '';
    if (member.dutyTitle !== 'Flight Chief' && member.dutyTitle !== 'Flight Commander') {
        const statusSlug = (member.status || 'unknown').toLowerCase().replace(/[\s-]/g, '_');
        statusTagHTML = `<span class="status-tag status-${statusSlug}">${member.status || 'N/A'}</span>`;
    }
    
    const medicalTagHTML = member.medicalProfile === 'Permanent' ? `<span class="medical-tag" title="Permanent Medical Profile">MED</span>` : '';
    const promoteButtonHTML = eligibility.showPromoteButton ? `<button class="action-btn promote-btn" title="Promote Member">⬆️</button>` : '';

    let eligibilityHTML = `${eligibility.status}${promoteButtonHTML}<span class="eligibility-note">${eligibility.note}</span>`;
    if (eligibility.className === 'board-concluded') {
        eligibilityHTML += `<br><button class="btz-action-btn" data-action="selected" data-new-dor="${eligibility.btzPromoDate}">Selected</button><button class="btz-action-btn" data-action="not-selected">Not Selected</button>`;
    }
    
    const supervisor = findMemberById(member.supervisor, allMembers);
    const supervisorName = supervisor ? `${RANK_ABBREVIATIONS[supervisor.rank] || supervisor.rank} ${supervisor.lastName}` : 'N/A';

    // === ALERT ICON LOGIC UPDATED HERE ===
    let alertHTML = '';
    if (eligibility.className === 'btz-next-q') {
        alertHTML = `<div class="alert-icon" title="BTZ Board Next Quarter">!</div>`;
    } else if (eligibility.className === 'btz-two-q') {
        alertHTML = `<div class="alert-icon-warning" title="BTZ Board in 2 Quarters">!</div>`;
    }
    
    const headerHTML = `<div class="card-header">${alertHTML}<div class="title-block"><span class="card-title">${rankDisplay} ${member.lastName}, ${member.firstName}</span>${dutyTitleSubtitle}</div>${statusTagHTML}${medicalTagHTML}${promotionTagHTML}<div class="hamburger-menu">☰</div><div class="context-menu"><button class="context-btn detail-btn">Detailed View</button><button class="context-btn modify-btn">Modify</button><button class="context-btn delete-btn">Delete</button></div></div>`;
    
    const gridItems = [];
    if (member.dutyTitle !== 'Flight Chief' && member.dutyTitle !== 'Flight Commander') gridItems.push(`<strong>Status:</strong><span>${member.status || 'N/A'}</span>`);
    if (member.dutyTitle !== 'Flight Commander') gridItems.push(`<strong>Supervisor:</strong><span>${supervisorName}</span>`);
    gridItems.push(`<strong>TIS Date:</strong><span>${member.tisDate || 'N/A'}</span>`);
    gridItems.push(`<strong>Date of Rank:</strong><span>${member.dorDate || 'N/A'}</span>`);
    gridItems.push(`<strong>Hometown:</strong><span>${member.hometown || 'N/A'}</span>`);

    if (member.customData && customFields) {
        customFields.forEach(field => {
            if (field.showOnCard) {
                const value = member.customData[field.id];
                if (value) {
                    gridItems.push(`<strong>${field.name}:</strong><span>${value}</span>`);
                }
            }
        });
    }

    const bodyGrid = `<div class="card-detail-grid">${gridItems.join('')}</div>`;
    const eligibilityDiv = `<div class="eligibility-cell eligibility-${eligibility.className}">${eligibilityHTML}</div>`;
    const bodyHTML = `<div class="card-body">${bodyGrid}${eligibilityDiv}</div>`;

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

    if (CUSTOM_FIELDS_CACHE.length === 0) {
        fieldset.style.display = 'none';
        return;
    }

    fieldset.style.display = 'block';
    CUSTOM_FIELDS_CACHE.forEach(field => {
        const value = memberData?.customData?.[field.id] || '';
        const fieldId = `custom_${field.id}`;
        
        const div = document.createElement('div');
        const label = document.createElement('label');
        label.setAttribute('for', fieldId);
        label.textContent = field.name;

        const input = document.createElement('input');
        input.type = field.type;
        input.id = fieldId;
        input.name = fieldId;
        input.value = value;
        
        div.appendChild(label);
        div.appendChild(input);
        container.appendChild(div);
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

    details.push(`<strong>Duty Title:</strong><span>${member.dutyTitle || 'N/A'}</span>`);
    details.push(`<strong>Team:</strong><span>${member.teamSelect?.replace('-container', '') || 'N/A'}</span>`);
    details.push(`<strong>Status:</strong><span>${member.status || 'N/A'}</span>`);
    details.push(`<strong>Supervisor:</strong><span>${supervisorName}</span>`);
    details.push(`<strong>TIS Date:</strong><span>${member.tisDate || 'N/A'}</span>`);
    details.push(`<strong>Date of Rank:</strong><span>${member.dorDate || 'N/A'}</span>`);
    details.push(`<strong>Hometown:</strong><span>${member.hometown || 'N/A'}</span>`);
    details.push(`<strong>Medical:</strong><span>${member.medicalProfile || 'N/A'}</span>`);

    if (member.customData && CUSTOM_FIELDS_CACHE) {
        CUSTOM_FIELDS_CACHE.forEach(field => {
            const value = member.customData[field.id] || 'N/A';
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

async function openFieldManagerModal() {
    await renderFieldManagerList();
    fieldsModal.style.display = 'block';
}

async function renderFieldManagerList() {
    const fields = await getCachedFields(true);
    const listContainer = document.getElementById('existing-fields-list');
    listContainer.innerHTML = '';
    if (fields.length === 0) {
        listContainer.innerHTML = '<p>No custom fields defined yet.</p>';
        return;
    }

    fields.forEach(field => {
        const item = document.createElement('div');
        item.className = 'existing-field-item';
        const isChecked = field.showOnCard ? 'checked' : '';
        item.innerHTML = `
            <div>
                <span>${field.name}</span>
                <span class="field-type">${field.type}</span>
            </div>
            <div class="existing-field-item-controls">
                <label class="toggle-switch">
                    <input type="checkbox" class="show-on-card-toggle" data-id="${field.id}" ${isChecked}>
                    <span class="slider"></span>
                </label>
                <button class="delete-field-btn" data-id="${field.id}">Delete</button>
            </div>
        `;
        listContainer.appendChild(item);
    });
}

async function handleAddFieldSubmit(event) {
    event.preventDefault();
    const nameInput = document.getElementById('new-field-name');
    const typeInput = document.getElementById('new-field-type');
    
    const newField = {
        id: `field_${Date.now()}`,
        name: nameInput.value.trim(),
        type: typeInput.value,
        showOnCard: true
    };

    if (!newField.name) {
        alert("Field name cannot be empty.");
        return;
    }

    const updatedFields = [...CUSTOM_FIELDS_CACHE, newField];
    await saveCustomFields(updatedFields);
    await renderFieldManagerList();
    addFieldForm.reset();
}

async function handleFieldListClick(event) {
    const fieldId = event.target.dataset.id;
    if (!fieldId) return;

    if (event.target.matches('.delete-field-btn')) {
        if (confirm("Are you sure you want to delete this field? This cannot be undone.")) {
            const updatedFields = CUSTOM_FIELDS_CACHE.filter(f => f.id !== fieldId);
            await saveCustomFields(updatedFields);
            await renderFieldManagerList();
            await renderAll(true);
        }
    } else if (event.target.matches('.show-on-card-toggle')) {
        const field = CUSTOM_FIELDS_CACHE.find(f => f.id === fieldId);
        if (field) {
            field.showOnCard = event.target.checked;
            await saveCustomFields(CUSTOM_FIELDS_CACHE);
            await renderAll(true);
        }
    }
}


// --- EVENT HANDLERS ---
function getDraggableCard(event) {
    return event.target.closest('.member-card, .chart-card, .chart-card-supervisor');
}

let activeDragImage = null;
let dragGhostOffset = { x: 0, y: 0 };
const transparentDragImage = document.createElement('canvas');
transparentDragImage.width = 1;
transparentDragImage.height = 1;

function clearDragImage() {
    if (activeDragImage) {
        activeDragImage.remove();
        activeDragImage = null;
    }
    dragGhostOffset = { x: 0, y: 0 };
}

function updateDragGhostPosition(event) {
    if (!activeDragImage) return;
    const x = event.clientX - dragGhostOffset.x;
    const y = event.clientY - dragGhostOffset.y;
    activeDragImage.style.transform = `translate(${x}px, ${y}px)`;
}

function setCustomDragImage(card, event) {
    if (!event.dataTransfer) return;
    clearDragImage();
    const rect = card.getBoundingClientRect();
    const offsetX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const offsetY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    dragGhostOffset = { x: offsetX, y: offsetY };

    const dragGhost = card.cloneNode(true);
    dragGhost.classList.remove('expanded', 'dragging');
    dragGhost.classList.add('drag-preview', 'drag-ghost');
    if (dragGhost.classList.contains('member-card')) {
        const body = dragGhost.querySelector('.card-body');
        if (body) {
            body.style.display = 'none';
            body.style.padding = '0';
            body.style.maxHeight = '0';
            body.style.overflow = 'hidden';
        }
        dragGhost.querySelectorAll('.context-menu.show').forEach(menu => menu.classList.remove('show'));
    }
    dragGhost.style.width = `${card.offsetWidth}px`;
    dragGhost.style.transform = 'translate(-9999px, -9999px)';
    document.body.appendChild(dragGhost);
    activeDragImage = dragGhost;
    updateDragGhostPosition(event);
    event.dataTransfer.setDragImage(transparentDragImage, 0, 0);
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
            alert("An error occurred while moving the member.");
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
    
    if (target.matches('.promote-btn') || target.matches('.btz-action-btn')) {
        const memberData = findMemberById(card.id, ALL_MEMBERS_CACHE);
        if(!memberData) return;
        
        if (target.matches('.promote-btn')) {
            const newDor = prompt("Enter new Date of Rank (YYYY-MM-DD):", new Date().toISOString().slice(0, 10));
            if (!newDor || !/^\d{4}-\d{2}-\d{2}$/.test(newDor)) {
                alert("Invalid date format.");
                return;
            }
            const currentRankIndex = PROMOTION_SEQUENCE.indexOf(memberData.rank);
            if (currentRankIndex > -1 && currentRankIndex < PROMOTION_SEQUENCE.length - 1) {
                memberData.rank = PROMOTION_SEQUENCE[currentRankIndex + 1];
                memberData.dorDate = newDor;
                await saveMember(memberData, true);
                await renderAll(true);
            } else {
                alert("Max rank reached or invalid current rank for promotion sequence.");
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
            if (monthsTIS >= 6 && monthsTIG >= 6) return { status: "Eligible for E-2", note: "TIS/TIG met.", className: "eligible", showPromoteButton: true };
            return { status: "Not Eligible", note: "Req: 6m TIS/TIG.", className: "not-eligible" };
        case 'E-2':
            if (monthsTIG >= 10) return { status: "Eligible for E-3", note: "TIG met.", className: "eligible", showPromoteButton: true };
            return { status: "Not Eligible", note: "Req: 10m TIG.", className: "not-eligible" };
        
        case 'E-3':
            const tisPathDate = new Date(tisDate);
            tisPathDate.setMonth(tisPathDate.getMonth() + 36);
            const tigPathDate = new Date(dorDate);
            tigPathDate.setMonth(tigPathDate.getMonth() + 28);
            const standardPromoDate = (tisPathDate < tigPathDate) ? tisPathDate : tigPathDate;
            const btzPromoDate = new Date(standardPromoDate);
            btzPromoDate.setMonth(btzPromoDate.getMonth() - 6);
            const currentQuarter = getQuarterInfo(today);
            const btzPromoQuarter = getQuarterInfo(btzPromoDate);
            const boardQuarter = getPreviousQuarterInfo(btzPromoQuarter);

            const nextQuarter = getNextQuarterInfo(currentQuarter);
            const twoQuartersOut = getNextQuarterInfo(nextQuarter); // Calculate two quarters from now
            
            const currentQuarterValue = getQuarterValue(currentQuarter);
            const boardQuarterValue = getQuarterValue(boardQuarter);

            if (btzStatus === 'not-selected') {
                if (today >= standardPromoDate) return { status: "Eligible for E-4", note: "Standard TIS/TIG met.", className: "eligible", showPromoteButton: true };
                return { status: "Not Selected for BTZ", note: `Eligible for SrA on ${standardPromoDate.toLocaleDateString()}`, className: "btz-not-selected" };
            }

            // New check for two quarters out (Yellow '!')
            if (boardQuarter.year === twoQuartersOut.year && boardQuarter.quarter === twoQuartersOut.quarter) {
                return { status: `BTZ Board in 2 Quarters`, note: `Board for Q${boardQuarter.quarter} ${boardQuarter.year}`, className: "btz-two-q" };
            }
            // Existing check for next quarter (Red '!')
            if (boardQuarter.year === nextQuarter.year && boardQuarter.quarter === nextQuarter.quarter) {
                return { status: `BTZ Board Next Quarter!`, note: `Board for Q${boardQuarter.quarter} ${boardQuarter.year}`, className: "btz-next-q" };
            }
            
            if (currentQuarterValue === boardQuarterValue) return { status: `In Q${boardQuarter.quarter} ${boardQuarter.year} BTZ Window`, note: "Board meets this quarter.", className: "btz-window" };
            if (currentQuarterValue > boardQuarterValue) return { status: "Board Concluded", note: `Board was Q${boardQuarter.quarter} ${boardQuarter.year}`, className: "board-concluded", btzPromoDate: btzPromoDate.toISOString().slice(0, 10) };
            return { status: "Not Eligible", note: `BTZ board: Q${boardQuarter.quarter} ${boardQuarter.year}`, className: "not-eligible" };

        case 'E-4':
            if (monthsTIS >= 36 && monthsTIG >= 6) return { status: "Eligible for E-5", note: "TIS/TIG met for SSgt.", className: "eligible", showPromoteButton: true };
            return { status: "Not Eligible", note: "Req: 36m TIS & 6m TIG.", className: "not-eligible" };
        case 'E-5':
            if (monthsTIS >= 60 && monthsTIG >= 23) return { status: "Eligible for E-6", note: "TIS/TIG met for TSgt.", className: "eligible", showPromoteButton: true };
            return { status: "Not Eligible", note: "Req: 60m TIS & 23m TIG.", className: "not-eligible" };
        case 'E-6':
            if (monthsTIS >= 96 && monthsTIG >= 24) return { status: "Eligible for E-7", note: "TIS/TIG met for MSgt.", className: "eligible", showPromoteButton: true };
            return { status: "Not Eligible", note: "Req: 96m TIS & 24m TIG.", className: "not-eligible" };
        case 'E-7':
            if (monthsTIS >= 132 && monthsTIG >= 20) return { status: "Board Eligible for E-8", note: "TIS/TIG met for SMSgt board.", className: "eligible", showPromoteButton: true };
            return { status: "Not Eligible", note: "Req: 132m TIS & 20m TIG.", className: "not-eligible" };
        case 'E-8':
            if (monthsTIS >= 168 && monthsTIG >= 21) return { status: "Board Eligible for E-9", note: "TIS/TIG met for CMSgt board.", className: "eligible", showPromoteButton: true };
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

function getMonthsDifference(d1, d2) {
    if (!d1 || !d2) return 0;
    return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
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

detailedViewModal.querySelector('.close-btn').addEventListener('click', () => detailedViewModal.style.display = 'none');

document.querySelector('.tab-nav').addEventListener('click', async (event) => {
    if (!event.target.matches('.tab-btn')) return;

    const tabId = event.target.dataset.tab;

    // Hide all tabs and content, then show the active one
    document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
    event.target.classList.add('active');
    const activeContent = document.getElementById(tabId);
    activeContent.classList.add('active');

    // Specifically handle rendering for the supervision view
    if (tabId === 'supervision-view') {
        // Use the members already in the cache to render the chart instantly.
        // The getCachedMembers function will fetch them if the cache is empty.
        const allMembers = await getCachedMembers();
        renderSupervisionChart(allMembers);
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

document.addEventListener('dragover', updateDragGhostPosition);

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
document.addEventListener('DOMContentLoaded', () => {
    renderAll(true);
});
