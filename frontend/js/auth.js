// frontend/js/auth.js
// Handles login, signup (dual-role), and OTP verification

(function () {
  const page = window.location.pathname;

  // ─── LOGIN PAGE ─────────────────────────────────────────────────────────────
  if (page.includes('login.html')) {
    if (getSession()) return (window.location.href = 'dashboard.html');

    const params = new URLSearchParams(window.location.search);
    if (params.get('email')) document.getElementById('email').value = params.get('email');

    document.getElementById('toggle-pw').addEventListener('click', function () {
      const pw = document.getElementById('password');
      pw.type = pw.type === 'password' ? 'text' : 'password';
      this.textContent = pw.type === 'password' ? '👁' : '🙈';
    });

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn      = document.getElementById('login-btn');
      const alertBox = document.getElementById('alert-box');
      const email    = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      btn.classList.add('btn-loading'); btn.disabled = true;
      alertBox.innerHTML = '';

      try {
        const data = await Auth.login(email, password);
        saveSession(data.token, data.user);
        showToast('Login successful! Redirecting...', 'success');
        setTimeout(() => (window.location.href = 'dashboard.html'), 800);
      } catch (err) {
        if (err.data && err.data.requiresVerification) {
          alertBox.innerHTML = `<div class="alert alert-warning">${err.message}<br/>
            <a href="signup.html?step=otp&email=${encodeURIComponent(email)}" class="btn btn-sm btn-primary" style="margin-top:10px;">Verify Email →</a></div>`;
        } else {
          alertBox.innerHTML = `<div class="alert alert-danger">❌ ${err.message}</div>`;
        }
      } finally {
        btn.classList.remove('btn-loading'); btn.disabled = false;
      }
    });
  }

  // ─── SIGNUP PAGE ─────────────────────────────────────────────────────────────
  if (page.includes('signup.html')) {
    if (getSession()) return (window.location.href = 'dashboard.html');

    let pendingEmail = '';

    // Pre-select role from URL
    const params = new URLSearchParams(window.location.search);
    const preRole = params.get('roles') || params.get('role');
    if (preRole) {
      const radioEl = document.querySelector(`input[name="roleChoice"][value="${preRole}"]`);
      if (radioEl) radioEl.checked = true;
    }

    // Jump to OTP step if redirected
    if (params.get('step') === 'otp' && params.get('email')) {
      pendingEmail = params.get('email');
      showOtpStep(pendingEmail);
    }

    // ── Signup form ──────────────────────────────────────────────────────────
    document.getElementById('signup-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn      = document.getElementById('signup-btn');
      const alertBox = document.getElementById('signup-alert');

      const password = document.getElementById('password').value;
      const confirm  = document.getElementById('confirm-password').value;
      if (password !== confirm) {
        return (alertBox.innerHTML = `<div class="alert alert-danger">❌ Passwords do not match</div>`);
      }
      if (password.length < 6) {
        return (alertBox.innerHTML = `<div class="alert alert-danger">❌ Password must be at least 6 characters</div>`);
      }

      // Build roles array from radio selection
      const roleChoice = document.querySelector('input[name="roleChoice"]:checked')?.value || 'donor';
      let roles;
      if (roleChoice === 'both') {
        roles = ['donor', 'receiver'];
      } else {
        roles = [roleChoice];
      }

      btn.classList.add('btn-loading'); btn.disabled = true;
      alertBox.innerHTML = '';

      const payload = {
        name:        document.getElementById('name').value.trim(),
        email:       document.getElementById('email').value.trim().toLowerCase(),
        password,
        roles,                                          // ← array for dual-role
        blood_group: document.getElementById('blood_group').value,
        city:        document.getElementById('city').value.trim(),
        phone:       document.getElementById('phone').value.trim(),
        age:         parseInt(document.getElementById('age').value) || 0,
        weight:      parseInt(document.getElementById('weight').value) || 0,
      };

      try {
        await Auth.signup(payload);
        pendingEmail = payload.email;
        showToast('Account created! Check your email for the OTP.', 'success');
        showOtpStep(pendingEmail);
      } catch (err) {
        alertBox.innerHTML = `<div class="alert alert-danger">❌ ${err.message}</div>`;
        if (err.data && err.data.requiresVerification) showOtpStep(payload.email);
      } finally {
        btn.classList.remove('btn-loading'); btn.disabled = false;
      }
    });

    // ── OTP verify ───────────────────────────────────────────────────────────
    document.getElementById('verify-btn').addEventListener('click', async () => {
      const btn      = document.getElementById('verify-btn');
      const alertBox = document.getElementById('otp-alert');
      const otp      = document.getElementById('otp-input').value.trim();

      if (!otp || otp.length !== 6) {
        return (alertBox.innerHTML = `<div class="alert alert-danger">❌ Please enter the 6-digit OTP</div>`);
      }

      btn.classList.add('btn-loading'); btn.disabled = true;
      alertBox.innerHTML = '';

      try {
        const data = await Auth.verifyOtp(pendingEmail, otp);
        saveSession(data.token, data.user);
        showToast('Email verified! Welcome to BloodConnect 🎉', 'success');
        setTimeout(() => (window.location.href = 'dashboard.html'), 1000);
      } catch (err) {
        alertBox.innerHTML = `<div class="alert alert-danger">❌ ${err.message}</div>`;
      } finally {
        btn.classList.remove('btn-loading'); btn.disabled = false;
      }
    });

    // Allow pressing Enter in OTP input
    document.getElementById('otp-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('verify-btn').click();
    });

    // ── Resend OTP ───────────────────────────────────────────────────────────
    document.getElementById('resend-btn').addEventListener('click', async () => {
      const alertBox = document.getElementById('otp-alert');
      try {
        await Auth.resendOtp(pendingEmail);
        alertBox.innerHTML = `<div class="alert alert-success">✅ New OTP sent to ${pendingEmail}</div>`;
      } catch (err) {
        alertBox.innerHTML = `<div class="alert alert-danger">❌ ${err.message}</div>`;
      }
    });
  }

  // ── Helper: show OTP step ────────────────────────────────────────────────
  function showOtpStep(email) {
    document.getElementById('step-signup').style.display = 'none';
    document.getElementById('step-otp').style.display = 'block';
    const hint = document.getElementById('otp-email-hint');
    if (hint) hint.textContent = `We sent a 6-digit code to ${email}`;
    document.getElementById('otp-input').focus();
  }
  window.showOtpStep = showOtpStep;
})();
