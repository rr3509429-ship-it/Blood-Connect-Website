// frontend/js/dashboard.js
// Full dashboard controller — dual-role aware

(function () {
  'use strict';

  // ── Auth guard ───────────────────────────────────────────────────────────────
  const session = requireAuth('login.html');
  if (!session) return;
  let currentUser = session.user;
  let activeDashboardView = 'donor'; // 'donor' or 'receiver'

  // ── On load ──────────────────────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', async () => {
    setupNavbar();
    setupSidebar();
    setupSidebarMobile();

    // Refresh user from server
    try {
      const data = await Auth.getMe();
      currentUser = data.user;
      saveSession(session.token, currentUser);
    } catch (e) { /* use cached */ }

    renderSidebarUser(currentUser);
    setupDashboardForRoles(currentUser);

    // Initial section load
    const roles = getUserRoles(currentUser);
    if (roles.includes('donor')) {
      activeDashboardView = 'donor';
      showSection('donor-overview');
      loadDonorOverview();
    } else {
      activeDashboardView = 'receiver';
      showSection('receiver-overview');
      loadReceiverOverview();
    }

    setupBloodRequestForm();
    setupProfileForm();
  });

  // ── Sidebar user info ────────────────────────────────────────────────────────
  function renderSidebarUser(user) {
    const roles = getUserRoles(user);
    const initial = (user.name || '?')[0].toUpperCase();
    document.getElementById('sidebar-avatar').textContent = initial;
    document.getElementById('sidebar-name').textContent   = user.name || '—';
    document.getElementById('sidebar-blood').textContent  = user.blood_group || '';

    const roleLabels = roles.map(r => r === 'donor' ? '🩸 Donor' : r === 'receiver' ? '🆘 Receiver' : r).join(' + ');
    document.getElementById('sidebar-role').textContent = roleLabels;

    // Navbar
    const navName = document.getElementById('nav-user-name');
    if (navName) navName.textContent = user.name;
    const navTags = document.getElementById('nav-role-tags');
    if (navTags) {
      navTags.innerHTML = roles.map(r => `<span class="role-tag ${r}">${r}</span>`).join('');
    }
  }

  // ── Setup sidebar navs based on roles ────────────────────────────────────────
  function setupDashboardForRoles(user) {
    const roles = getUserRoles(user);
    const isDonor    = roles.includes('donor');
    const isReceiver = roles.includes('receiver');
    const isAdmin    = roles.includes('admin');
    const isBoth     = isDonor && isReceiver;

    if (isDonor)    document.getElementById('nav-donor').style.display    = 'block';
    if (isReceiver) document.getElementById('nav-receiver').style.display = 'block';
    if (isAdmin)    document.getElementById('nav-admin').style.display    = 'block';

    // Show role switcher for dual-role users
    if (isBoth) {
      document.getElementById('role-switcher-wrap').style.display = 'block';
    }
  }

  // ── Role view switcher (dual-role users) ─────────────────────────────────────
  window.switchDashboardView = function (view) {
    activeDashboardView = view;
    document.getElementById('switch-donor-btn').classList.toggle('active', view === 'donor');
    document.getElementById('switch-receiver-btn').classList.toggle('active', view === 'receiver');
    if (view === 'donor') {
      showSection('donor-overview');
      loadDonorOverview();
    } else {
      showSection('receiver-overview');
      loadReceiverOverview();
    }
  };

  // ── Section navigation ────────────────────────────────────────────────────────
  window.showSection = function (id) {
    document.querySelectorAll('.section-content').forEach(el => el.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');

    // Update active link
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    document.querySelectorAll(`.sidebar-nav a[onclick*="${id}"]`).forEach(a => a.classList.add('active'));

    // Load on demand
    if (id === 'donor-requests')       loadDonorRequests();
    if (id === 'donor-history')        loadDonationHistory();
    if (id === 'donor-eligibility')    loadEligibility();
    if (id === 'receiver-my-requests') loadReceiverRequests();
    if (id === 'profile')              loadProfile();
  };

  // ── DONOR OVERVIEW ────────────────────────────────────────────────────────────
  async function loadDonorOverview() {
    // Stats from currentUser
    document.getElementById('d-total-donations').textContent = currentUser.total_donations || 0;
    document.getElementById('d-response-rate').textContent   = (currentUser.response_rate || 100) + '%';
    document.getElementById('d-last-donation').textContent   = currentUser.last_donation_date
      ? formatDate(currentUser.last_donation_date) : 'Never';

    // Availability toggle state
    const avail = currentUser.availability !== false;
    const toggle = document.getElementById('avail-toggle');
    const slider = document.getElementById('avail-slider');
    if (toggle) toggle.checked = avail;
    updateAvailSlider(avail);

    // Load donor requests for preview + count
    loadDonorRequests(true);
  }

  function updateAvailSlider(on) {
    const slider = document.getElementById('avail-slider');
    const text   = document.getElementById('avail-status-text');
    if (!slider) return;
    const knob = slider.querySelector('span');
    slider.style.background = on ? 'var(--green)' : 'var(--grey-300)';
    if (knob) knob.style.left = on ? '28px' : '4px';
    if (text) {
      text.textContent = on ? '✅ Available for Donation' : '⏸ Currently Unavailable';
      text.style.color = on ? 'var(--green)' : 'var(--grey-500)';
    }
  }

  window.toggleAvailability = async function (val) {
    updateAvailSlider(val);
    try {
      await Donors.setAvailability(val);
      currentUser.availability = val;
      saveSession(session.token, currentUser);
      showToast(val ? '✅ You are now available for donations' : '⏸ Availability turned off', val ? 'success' : 'info');
      // Show/hide donor requests section based on availability
      const reqsCard = document.getElementById('donor-requests-preview')?.closest('.card');
      if (reqsCard) reqsCard.style.display = val ? 'block' : 'none';
      // If turning ON, refresh blood requests immediately
      if (val) loadDonorRequests(true);
    } catch (e) {
      showToast('Failed to update availability', 'error');
    }
  };

  // ── DONOR REQUESTS ────────────────────────────────────────────────────────────
  window.loadDonorRequests = async function (preview = false) {
    const listEl    = document.getElementById(preview ? 'donor-requests-preview' : 'donor-requests-list');
    const countBadge = document.getElementById('d-req-count');
    if (!listEl) return;
    listEl.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';

    try {
      const data = await Requests.getDonorRequests();
      const reqs = data.requests || [];

      if (countBadge) countBadge.textContent = reqs.length;
      document.getElementById('d-pending-requests').textContent = reqs.length;

      if (!reqs.length) {
        listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>No matched blood requests right now.<br/>Check back later or ensure your availability is on.</p></div>';
        return;
      }

      const limit = preview ? 3 : reqs.length;
      listEl.innerHTML = reqs.slice(0, limit).map(req => renderRequestItem(req, 'donor')).join('');
    } catch (e) {
      listEl.innerHTML = `<div class="alert alert-danger">Failed to load requests: ${e.message}</div>`;
    }
  };

  function renderRequestItem(req, viewAs) {
    const emergency = req.isEmergency ? ' emergency' : '';
    const status    = req.status || 'pending';
    const reqId     = req._id;
    const donorActions = viewAs === 'donor' && ['pending','matched'].includes(status) ? `
      <button class="btn btn-success btn-sm" onclick="acceptRequest('${reqId}')">✅ Accept</button>
      <button class="btn btn-secondary btn-sm" onclick="rejectRequest('${reqId}')">✕ Decline</button>` : '';
    const receiverActions = viewAs === 'receiver' ? `
      ${status === 'accepted' ? `<button class="btn btn-secondary btn-sm" onclick="showSection('receiver-my-requests')">View Details</button>` : ''}
      ${['pending','matched'].includes(status) ? `<button class="btn btn-danger btn-sm" onclick="cancelRequest('${reqId}')">Cancel</button>` : ''}
    ` : '';

    return `<div class="request-item${emergency}" id="req-${reqId}">
      <div class="request-header">
        <span class="blood-badge">${req.blood_group}</span>
        <span class="badge badge-${status}">${status}</span>
        ${req.isEmergency ? '' : ''}
      </div>
      <div class="request-meta">
        <span>📍 ${req.city}</span>
        ${req.hospital ? `<span>🏥 ${req.hospital}</span>` : ''}
        <span>🩸 ${req.units_needed || 1} unit(s)</span>
        <span>🕐 ${timeAgo(req.createdAt)}</span>
        ${req.requester_id?.name ? `<span>👤 ${req.requester_id.name}</span>` : ''}
      </div>
      ${req.notes ? `<div style="font-size:.85rem;color:var(--grey-500);margin-bottom:.5rem;">📝 ${req.notes}</div>` : ''}
      <div class="request-actions">${donorActions}${receiverActions}</div>
    </div>`;
  }

  // ── Accept / Reject / Cancel ──────────────────────────────────────────────────
  window.acceptRequest = async function (requestId) {
    const btn = document.querySelector(`#req-${requestId} .btn-success`);
    if (btn) { btn.textContent = '⏳'; btn.disabled = true; }
    try {
      const data = await Donors.acceptRequest(requestId);
      showToast('✅ Request accepted! Please proceed to donate.', 'success');
      // Show receipt download option
      if (data.transactionId) {
        showToast(`📄 Transaction ID: ${data.transactionId}`, 'info', 6000);
      }
      loadDonorRequests();
    } catch (e) {
      showToast(e.message || 'Failed to accept request', 'error');
      if (btn) { btn.textContent = '✅ Accept'; btn.disabled = false; }
    }
  };

  window.rejectRequest = async function (requestId) {
    try {
      await Donors.rejectRequest(requestId);
      showToast('Request declined', 'info');
      document.getElementById(`req-${requestId}`)?.remove();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  window.cancelRequest = async function (requestId) {
    if (!confirm('Cancel this blood request?')) return;
    try {
      await Requests.cancel(requestId);
      showToast('Request cancelled', 'info');
      loadReceiverRequests();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  // ── Complete donation ─────────────────────────────────────────────────────────
  window.completeDonation = async function (donationId) {
    if (!confirm('Mark this donation as completed?')) return;
    try {
      const data = await Donors.completeDonation(donationId);
      showToast('🎉 Donation completed! Thank you for saving a life!', 'success', 6000);
      if (data.transactionId) {
        const url = Donations.getReceiptUrl(data.transactionId);
        showToast(`📄 Receipt ready! <a href="${url}" target="_blank" style="color:#fff;text-decoration:underline;">Download PDF</a>`, 'success', 8000);
      }
      loadDonationHistory();
    } catch (e) {
      showToast(e.message, 'error');
    }
  };

  // ── DONATION HISTORY ──────────────────────────────────────────────────────────
  window.loadDonationHistory = async function () {
    const el = document.getElementById('donation-history-list');
    if (!el) return;
    el.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';
    try {
      const data = await Donors.getHistory();
      const donations = data.donations || [];
      if (!donations.length) {
        el.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><p>No donations yet.<br/>Accept a blood request to get started!</p></div>';
        return;
      }
      el.innerHTML = `<div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Blood Group</th><th>Receiver</th><th>Hospital</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>${donations.map(d => {
          const txnId = d.transaction_id || d.receipt_id;
          const receiptBtn = txnId
            ? `<a href="${Donations.getReceiptUrl(txnId)}" target="_blank" class="btn btn-secondary btn-sm">📄 Receipt</a>`
            : (d.status === 'pending' ? `<button class="btn btn-secondary btn-sm" onclick="generateReceipt('${d._id}')">Generate Receipt</button>` : '—');
          const completeBtn = d.status === 'pending'
            ? `<button class="btn btn-success btn-sm" onclick="completeDonation('${d._id}')">✅ Complete</button>` : '';
          return `<tr>
            <td>${formatDate(d.date)}</td>
            <td><span class="blood-badge" style="font-size:.8rem;">${d.blood_group}</span></td>
            <td>${d.receiver_id?.name || 'General Donation'}</td>
            <td>${d.request_id?.hospital || d.hospital || '—'}</td>
            <td><span class="badge badge-${d.status}">${d.status}</span></td>
            <td style="display:flex;gap:.4rem;">${completeBtn}${receiptBtn}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;
    } catch (e) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load history: ${e.message}</div>`;
    }
  };

  window.generateReceipt = async function (donationId) {
    try {
      const data = await Donations.generateReceipt(donationId);
      showToast('📄 Receipt generated!', 'success');
      // FIX: Use getReceiptUrl (with token) instead of raw receipt_url (no token)
      const receiptUrl = Donations.getReceiptUrl(data.transaction_id);
      window.open(receiptUrl, '_blank');
      loadDonationHistory();
    } catch (e) {
      showToast('Failed to generate receipt', 'error');
    }
  };

  // ── ELIGIBILITY ───────────────────────────────────────────────────────────────
  async function loadEligibility() {
    const el = document.getElementById('eligibility-content');
    if (!el) return;
    el.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';
    try {
      const data = await Donors.checkEligibility();
      const cls  = data.eligible ? 'eligible' : 'ineligible';
      const icon = data.eligible ? '✅' : '❌';
      el.innerHTML = `
        <div class="eligibility-box ${cls}">
          <div style="font-size:1.2rem;font-weight:700;">${icon} ${data.eligible ? 'You are eligible to donate!' : 'Not eligible right now'}</div>
          ${data.eligible ? `<div class="text-muted mt-1">All criteria met. You can accept donation requests.</div>` : ''}
          ${!data.eligible && data.reasons?.length ? `
            <div class="eligibility-checks mt-2">
              ${data.reasons.map(r => `<div class="check-item"><span>⚠️</span><span>${r}</span></div>`).join('')}
            </div>` : ''}
          ${data.nextEligibleDate && !data.eligible ? `
            <div class="mt-2" style="font-size:.9rem;"><strong>Next eligible date:</strong> ${formatDate(data.nextEligibleDate)}</div>` : ''}
        </div>
        <div class="card mt-2">
          <div class="card-title" style="margin-bottom:1rem;">📋 Donation Criteria</div>
          <div class="eligibility-checks">
            <div class="check-item"><span>${currentUser.age >= 18 && currentUser.age <= 65 ? '✅' : '❌'}</span><span>Age: 18–65 years (yours: ${currentUser.age || '—'})</span></div>
            <div class="check-item"><span>${(currentUser.weight || 0) >= 50 ? '✅' : '❌'}</span><span>Weight: min 50 kg (yours: ${currentUser.weight || '—'} kg)</span></div>
            <div class="check-item"><span>ℹ️</span><span>No donation in last 56 days</span></div>
            <div class="check-item"><span>ℹ️</span><span>No recent illness, fever or infections</span></div>
          </div>
        </div>`;
    } catch (e) {
      el.innerHTML = `<div class="alert alert-danger">Failed to check eligibility: ${e.message}</div>`;
    }
  }

  // ── RECEIVER OVERVIEW ─────────────────────────────────────────────────────────
  async function loadReceiverOverview() {
    try {
      const data = await Requests.getMyRequests();
      const reqs = data.requests || [];
      const pending   = reqs.filter(r => ['pending','matched'].includes(r.status)).length;
      const completed = reqs.filter(r => r.status === 'completed').length;
      const emergency = reqs.filter(r => r.isEmergency).length;
      document.getElementById('r-total-requests').textContent = reqs.length;
      document.getElementById('r-pending').textContent    = pending;
      document.getElementById('r-completed').textContent  = completed;
      document.getElementById('r-emergency').textContent  = emergency;

      const prevEl = document.getElementById('receiver-requests-preview');
      if (prevEl) {
        prevEl.innerHTML = reqs.slice(0, 3).map(r => renderRequestItem(r, 'receiver')).join('') ||
          '<div class="empty-state"><div class="empty-icon">📋</div><p>No requests yet. <a href="#" onclick="showSection(\'receiver-request\')">Create one</a>.</p></div>';
      }
    } catch (e) { /* silently fail */ }
  }

  // ── RECEIVER REQUESTS ─────────────────────────────────────────────────────────
  window.loadReceiverRequests = async function () {
    const el = document.getElementById('receiver-requests-list');
    if (!el) return;
    el.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';
    try {
      const data = await Requests.getMyRequests();
      const reqs = data.requests || [];
      if (!reqs.length) {
        el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>No blood requests yet.<br/><a href="#" onclick="showSection(\'receiver-request\')">Create your first request →</a></p></div>';
        return;
      }
      el.innerHTML = reqs.map(r => renderRequestItem(r, 'receiver')).join('');
    } catch (e) {
      el.innerHTML = `<div class="alert alert-danger">Failed to load requests: ${e.message}</div>`;
    }
  };

  // ── BLOOD REQUEST FORM ────────────────────────────────────────────────────────
  function setupBloodRequestForm() {
    const form = document.getElementById('blood-request-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn   = document.getElementById('req-submit-btn');
      const alert = document.getElementById('req-form-alert');
      btn.classList.add('btn-loading'); btn.disabled = true;
      alert.innerHTML = '';

      const payload = {
        blood_group:  document.getElementById('req-blood-group').value,
        city:         document.getElementById('req-city').value.trim(),
        hospital:     document.getElementById('req-hospital').value.trim(),
        units_needed: parseInt(document.getElementById('req-units').value) || 1,
        notes:        document.getElementById('req-notes').value.trim(),
        isEmergency:  document.getElementById('req-emergency').checked,
        location:     window._userLocation || { lat: 0, lng: 0 }
      };

      try {
        const data = await Requests.create(payload);
        showToast('🆘 Blood request submitted!', 'success');
        alert.innerHTML = `<div class="alert alert-success">✅ Request created! ${data.matchedDonors?.length || 0} donor(s) have been notified.</div>`;
        form.reset();
        const resultEl = document.getElementById('req-match-result');
        if (resultEl && data.matchedDonors?.length) {
          resultEl.style.display = 'block';
          resultEl.innerHTML = `<div class="card"><div class="card-title" style="margin-bottom:.75rem;">🎯 ${data.matchedDonors.length} Matched Donor(s)</div>
            ${data.matchedDonors.map(d => `<div class="request-item" style="margin-bottom:.5rem;">
              <strong>${d.name}</strong> — ${d.blood_group} — ${d.city}
              ${d.distance ? `<span class="text-muted"> (${d.distance} km away)</span>` : ''}
            </div>`).join('')}</div>`;
        }
      } catch (e) {
        alert.innerHTML = `<div class="alert alert-danger">❌ ${e.message}</div>`;
      } finally {
        btn.classList.remove('btn-loading'); btn.disabled = false;
      }
    });
  }

  // ── PROFILE ───────────────────────────────────────────────────────────────────
  function loadProfile() {
    const u = currentUser;
    const roles = getUserRoles(u);

    // Avatar
    document.getElementById('prof-avatar-lg').textContent = (u.name || '?')[0].toUpperCase();
    document.getElementById('prof-name-lg').textContent   = u.name || '';
    const roleTagsEl = document.getElementById('prof-roles-display');
    if (roleTagsEl) roleTagsEl.innerHTML = roles.map(r => `<span class="role-tag ${r}">${r}</span>`).join('');

    // Info rows
    const infoEl = document.getElementById('profile-info-rows');
    if (infoEl) {
      infoEl.innerHTML = [
        ['Email',       u.email],
        ['Blood Group', `<span class="blood-badge" style="font-size:.8rem;">${u.blood_group}</span>`],
        ['City',        u.city],
        ['Phone',       u.phone || '—'],
        ['Age',         u.age ? u.age + ' years' : '—'],
        ['Weight',      u.weight ? u.weight + ' kg' : '—'],
        ['Donations',   u.total_donations || 0],
        ['Response Rate', (u.response_rate || 100) + '%'],
      ].map(([label, value]) => `
        <div class="profile-row">
          <span class="label">${label}</span>
          <span class="value">${value}</span>
        </div>`).join('');
    }

    // Pre-fill edit form
    document.getElementById('prof-name').value   = u.name   || '';
    document.getElementById('prof-city').value   = u.city   || '';
    document.getElementById('prof-phone').value  = u.phone  || '';
    document.getElementById('prof-age').value    = u.age    || '';
    document.getElementById('prof-weight').value = u.weight || '';

    // Role checkboxes
    const donorCb    = document.getElementById('role-donor-cb');
    const receiverCb = document.getElementById('role-receiver-cb');
    if (donorCb)    donorCb.checked    = roles.includes('donor');
    if (receiverCb) receiverCb.checked = roles.includes('receiver');
  }

  function setupProfileForm() {
    const form = document.getElementById('profile-form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn   = document.getElementById('profile-save-btn');
      const alert = document.getElementById('profile-edit-alert');
      btn.classList.add('btn-loading'); btn.disabled = true;
      alert.innerHTML = '';

      const roles = [];
      if (document.getElementById('role-donor-cb')?.checked)    roles.push('donor');
      if (document.getElementById('role-receiver-cb')?.checked) roles.push('receiver');
      if (!roles.length) roles.push('donor'); // must have at least one

      const payload = {
        name:   document.getElementById('prof-name').value.trim(),
        city:   document.getElementById('prof-city').value.trim(),
        phone:  document.getElementById('prof-phone').value.trim(),
        age:    parseInt(document.getElementById('prof-age').value)    || 0,
        weight: parseInt(document.getElementById('prof-weight').value) || 0,
        roles
      };

      try {
        const data = await Auth.updateProfile(payload);
        currentUser = data.user;
        saveSession(session.token, currentUser);
        renderSidebarUser(currentUser);
        setupDashboardForRoles(currentUser);
        loadProfile();
        alert.innerHTML = '<div class="alert alert-success">✅ Profile saved!</div>';
        showToast('Profile updated', 'success');
      } catch (e) {
        alert.innerHTML = `<div class="alert alert-danger">❌ ${e.message}</div>`;
      } finally {
        btn.classList.remove('btn-loading'); btn.disabled = false;
      }
    });
  }

  // ── Navbar & Sidebar setup ────────────────────────────────────────────────────
  function setupNavbar() {
    document.getElementById('hamburger')?.addEventListener('click', () => {
      document.getElementById('navLinks')?.classList.toggle('open');
    });
  }

  function setupSidebar() {
    // Close sidebar nav items close mobile menu
    document.querySelectorAll('.sidebar-nav a').forEach(a => {
      a.addEventListener('click', () => closeMobileSidebar());
    });
  }

  function setupSidebarMobile() {
    const toggle  = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (!toggle) return;
    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('show');
    });
    overlay.addEventListener('click', () => closeMobileSidebar());

    // Show toggle button on mobile
    if (window.innerWidth <= 900) toggle.style.display = 'flex';
    window.addEventListener('resize', () => {
      toggle.style.display = window.innerWidth <= 900 ? 'flex' : 'none';
    });
  }

  function closeMobileSidebar() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebar-overlay')?.classList.remove('show');
  }

  // ── Logout ────────────────────────────────────────────────────────────────────
  window.logout = function () {
    clearSession();
    window.location.href = 'login.html';
  };
})();
