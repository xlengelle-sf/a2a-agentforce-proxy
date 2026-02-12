/**
 * Login form handler.
 * Submits credentials via JSON POST to /dashboard/login.
 * On success, redirects to /dashboard.
 */
(function () {
  'use strict';

  var form = document.getElementById('login-form');
  var errorEl = document.getElementById('login-error');
  var loginBtn = document.getElementById('login-btn');

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var username = document.getElementById('username').value.trim();
    var password = document.getElementById('password').value;

    if (!username || !password) {
      showError('Please enter username and password.');
      return;
    }

    // Disable button during request
    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in...';
    hideError();

    fetch('/dashboard/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password }),
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (data) {
            throw new Error(data.error || 'Login failed');
          });
        }
        return res.json();
      })
      .then(function (data) {
        if (data.redirect) {
          window.location.href = data.redirect;
        }
      })
      .catch(function (err) {
        showError(err.message || 'Login failed. Please try again.');
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign In';
      });
  });

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  function hideError() {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }
})();
