const byId = id => document.getElementById(id);
let current = null;
let editing = null;

function status(message, error = false) {
  byId('status').textContent = message;
  byId('status').dataset.error = String(error);
}

async function api(path, method = 'GET', value, code = current?.code) {
  const response = await fetch(path, {
    method, headers: { ...(code ? { Authorization: `Bearer ${code}` } : {}), ...(value ? { 'Content-Type': 'application/json' } : {}) },
    ...(value ? { body: JSON.stringify(value) } : {})
  });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

async function action(button, run) {
  button.disabled = true;
  try { await run(); } catch (error) { status(error.message, true); }
  finally { button.disabled = false; }
}

function field(form, name) { return form.elements.namedItem(name); }
function planPath() { return `/v1/plans/${current.id}`; }

function edit(player) {
  editing = player;
  const form = byId('registration-form');
  for (const [key, value] of Object.entries(player)) if (form.elements.namedItem(key)) field(form, key).value = value;
  byId('registration-section').hidden = false;
  byId('registration-submit').textContent = 'Save registration';
}

async function load() {
  const data = await api(planPath());
  current.data = data;
  editing = null;
  const manage = data.access === 'manage', own = data.registrations.find(row => row.id === data.registrationId);
  byId('plan-section').hidden = false;
  byId('plan-heading').textContent = data.plan.name;
  byId('plan-time').textContent = data.plan.eventAt ? new Date(data.plan.eventAt).toLocaleString() : 'Event time not set';
  byId('plan-notes').textContent = data.plan.notes;
  byId('plan-meta').textContent = `${data.plan.closed ? 'Registration closed' : 'Registration open'} · Expires ${new Date(data.plan.expiresAt).toLocaleDateString()}`;
  byId('access-role').textContent = { manage: 'Managing this plan', join: 'Alliance invitation', view: 'View only', registration: 'Your registration' }[data.access];
  byId('close-plan').hidden = !manage;
  byId('close-plan').textContent = data.plan.closed ? 'Reopen registration' : 'Close registration';
  byId('delete-section').hidden = !manage;
  byId('create-section').hidden = true;
  byId('registration-section').hidden = !(['join', 'manage', 'registration'].includes(data.access) && (!data.plan.closed || manage));
  byId('registration-submit').textContent = 'Register';
  byId('registration-form').reset();
  if (own && !data.plan.closed) edit(own);
  const roster = byId('roster');
  roster.replaceChildren();
  byId('roster-total').textContent = `${data.registrations.length} / 120 players registered`;
  for (const player of data.registrations) {
    const li = document.createElement('li'), name = document.createElement('strong'), summary = document.createElement('p'), notes = document.createElement('p');
    name.textContent = player.nickname;
    summary.textContent = `${player.availability} · ${player.infantry.toLocaleString()} infantry · ${player.cavalry.toLocaleString()} cavalry · ${player.archers.toLocaleString()} archers · ${player.marches} marches`;
    notes.textContent = player.notes;
    notes.className = 'preserve';
    li.append(name, summary, notes);
    if (manage || player.id === data.registrationId) {
      const button = document.createElement('button'); button.textContent = 'Edit registration'; button.type = 'button';
      button.addEventListener('click', () => { edit(player); byId('registration-heading').scrollIntoView(); }); li.append(button);
    }
    roster.append(li);
  }
  status('Plan loaded.');
}

byId('open-form').addEventListener('submit', event => {
  event.preventDefault();
  action(event.submitter, async () => {
    const form = event.currentTarget;
    const id = field(form, 'id').value.trim(), code = field(form, 'code').value.trim();
    if (!/^[0-9a-f-]{36}$/.test(id) || !/^(?:[A-Za-z0-9_-]{22}|[A-Za-z0-9_-]{43})$/.test(code)) throw new Error('Check the plan ID and access code.');
    const previous = current;
    current = { id, code };
    try { await load(); } catch (error) { current = previous; throw error; }
    byId('codes-section').hidden = true;
    byId('edit-code-section').hidden = true;
    sessionStorage.setItem('vikings-access', JSON.stringify({ id, code }));
  });
});

byId('create-form').addEventListener('submit', event => {
  event.preventDefault();
  action(event.submitter, async () => {
    const form = event.currentTarget;
    const data = await api('/v1/plans', 'POST', {
      name: field(form, 'name').value, notes: field(form, 'notes').value,
      eventAt: field(form, 'eventAt').value ? new Date(field(form, 'eventAt').value).toISOString() : null
    }, null);
    current = { id: data.plan.id, code: data.codes.manage };
    byId('created-id').value = current.id;
    for (const role of ['manage', 'join', 'view']) byId(`${role}-code`).value = data.codes[role];
    byId('codes-section').hidden = false;
    field(byId('open-form'), 'id').value = current.id;
    field(byId('open-form'), 'code').value = current.code;
    sessionStorage.setItem('vikings-access', JSON.stringify({ id: current.id, code: current.code }));
    await load();
    status('Plan created. Save the management, invitation, and viewing codes now.');
  });
});

byId('registration-form').addEventListener('submit', event => {
  event.preventDefault();
  action(event.submitter, async () => {
    const form = event.currentTarget;
    const value = Object.fromEntries(new FormData(form));
    for (const key of ['infantry', 'cavalry', 'archers', 'marchCapacity', 'marches']) value[key] = Number(value[key]);
    const data = editing
      ? await api(`${planPath()}/registrations/${editing.id}`, 'PUT', { ...value, revision: editing.revision })
      : await api(`${planPath()}/registrations`, 'POST', value);
    if (data.editCode) {
      byId('edit-code').value = data.editCode;
      byId('edit-code-section').hidden = false;
      if (current.data.access === 'join') {
        current.code = data.editCode;
        field(byId('open-form'), 'code').value = current.code;
        sessionStorage.setItem('vikings-access', JSON.stringify({ id: current.id, code: current.code }));
      }
    }
    await load(); status(data.editCode ? 'Registered. Save your private edit code.' : 'Registration saved.');
  });
});

byId('refresh').addEventListener('click', event => action(event.currentTarget, load));
byId('close-plan').addEventListener('click', event => action(event.currentTarget, async () => {
  await api(planPath(), 'PATCH', { closed: !current.data.plan.closed, revision: current.data.plan.revision });
  await load();
}));
byId('delete-plan').addEventListener('click', event => action(event.currentTarget, async () => {
  if (!byId('confirm-delete').checked) throw new Error('Tick the confirmation before deleting this plan.');
  await api(planPath(), 'DELETE'); sessionStorage.removeItem('vikings-access'); current = null;
  for (const id of ['plan-section', 'codes-section', 'registration-section', 'delete-section', 'edit-code-section']) byId(id).hidden = true;
  byId('create-section').hidden = false;
  byId('confirm-delete').checked = false;
  field(byId('open-form'), 'id').value = ''; field(byId('open-form'), 'code').value = '';
  status('Plan deleted.');
}));

api('/health', 'GET', undefined, null).then(() => {
  status('Service ready. Create a plan or enter an access code.');
  try {
    const saved = JSON.parse(sessionStorage.getItem('vikings-access') || 'null');
    if (saved) { field(byId('open-form'), 'id').value = saved.id; field(byId('open-form'), 'code').value = saved.code; }
  } catch { sessionStorage.removeItem('vikings-access'); }
}).catch(error => status(error.message, true));
