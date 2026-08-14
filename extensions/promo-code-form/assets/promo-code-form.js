(function () {
  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function resolvePromoApiUrl(endpoint) {
    var url = endpoint.replace(/\/$/, "");
    if (url.indexOf("/apps/") === 0) {
      return url;
    }
    if (url.indexOf("http://") === 0 || url.indexOf("https://") === 0) {
      return url + "/api/promo";
    }
    return url;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }

    return new Promise(function (resolve, reject) {
      var textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();

      try {
        document.execCommand("copy");
        resolve(undefined);
      } catch (error) {
        reject(error);
      } finally {
        document.body.removeChild(textarea);
      }
    });
  }

  function showResult(container, code, message) {
    var requestPanel = container.querySelector("[data-promo-request-panel]");
    var resultPanel = container.querySelector("[data-promo-result-panel]");
    var codeValue = container.querySelector("[data-promo-code-value]");
    var resultMessage = container.querySelector("[data-promo-result-message]");

    if (!requestPanel || !resultPanel || !codeValue) {
      return;
    }

    codeValue.textContent = code;
    if (resultMessage) {
      resultMessage.textContent = message;
    }

    requestPanel.hidden = true;
    resultPanel.hidden = false;
  }

  function applyDiscountValue(discountValue, value) {
    discountValue.textContent = value;
    discountValue.classList.remove("is-loading");
    discountValue.removeAttribute("aria-busy");
  }

  function syncDiscountFromSettings(container, apiEndpoint) {
    var discountValue = container.querySelector("[data-promo-discount-value]");
    if (!discountValue) {
      return;
    }

    var fallback = discountValue.getAttribute("data-promo-discount-fallback");

    if (!apiEndpoint) {
      if (fallback) {
        applyDiscountValue(discountValue, fallback);
      }
      return;
    }

    fetch(resolvePromoApiUrl(apiEndpoint), {
      method: "GET",
      headers: { Accept: "application/json" },
    })
      .then(function (response) {
        if (!response.ok) {
          return null;
        }
        return response.json();
      })
      .then(function (payload) {
        if (
          payload &&
          typeof payload.discountPercentage === "number" &&
          payload.discountPercentage >= 1
        ) {
          applyDiscountValue(
            discountValue,
            String(payload.discountPercentage),
          );
          return;
        }

        if (fallback) {
          applyDiscountValue(discountValue, fallback);
        }
      })
      .catch(function () {
        if (fallback) {
          applyDiscountValue(discountValue, fallback);
        }
      });
  }

  function initPromoCodeForms() {
    var containers = document.querySelectorAll(
      "[data-promo-code-form]:not([data-promo-bound])",
    );

    containers.forEach(function (container) {
      container.setAttribute("data-promo-bound", "true");

      var form = container.querySelector("[data-promo-code-form-el]");
      var status = container.querySelector("[data-promo-code-form-status]");
      var submitButton = container.querySelector(".promo-code-form__submit");
      var copyButton = container.querySelector("[data-promo-copy-button]");
      var copyIcon = container.querySelector("[data-promo-copy-icon]");
      var apiEndpoint = (container.getAttribute("data-api-endpoint") || "").trim();

      if (!form || !submitButton) {
        return;
      }

      syncDiscountFromSettings(container, apiEndpoint);

      var messages = {
        success: container.getAttribute("data-msg-success") || "Success",
        duplicate: container.getAttribute("data-msg-duplicate") || "Code resent",
        error: container.getAttribute("data-msg-error") || "Something went wrong",
        invalidEmail:
          container.getAttribute("data-msg-invalid-email") ||
          "Please enter a valid email address",
        missingAppUrl:
          container.getAttribute("data-msg-missing-app-url") ||
          "App URL is not configured in theme settings.",
        copied: container.getAttribute("data-msg-copied") || "Code copied",
      };

      function setStatus(message, state) {
        if (!status) {
          return;
        }
        status.textContent = message;
        status.setAttribute("data-state", state);
      }

      function handleCopy() {
        var codeValue = container.querySelector("[data-promo-code-value]");
        if (!codeValue || !codeValue.textContent) {
          return;
        }

        copyText(codeValue.textContent)
          .then(function () {
            if (copyButton) {
              var original = copyButton.textContent;
              copyButton.textContent = messages.copied;
              setTimeout(function () {
                copyButton.textContent = original;
              }, 1800);
            }
          })
          .catch(function () {
            setStatus(messages.error, "error");
          });
      }

      if (copyButton) {
        copyButton.addEventListener("click", handleCopy);
      }

      if (copyIcon) {
        copyIcon.addEventListener("click", handleCopy);
      }

      form.addEventListener("submit", function (event) {
        event.preventDefault();

        var emailInput = form.querySelector('input[name="email"]');
        var email = emailInput ? emailInput.value.trim() : "";

        if (!email || !isValidEmail(email)) {
          setStatus(messages.invalidEmail, "error");
          return;
        }

        if (!apiEndpoint) {
          setStatus(messages.missingAppUrl, "error");
          return;
        }

        submitButton.disabled = true;
        submitButton.classList.add("is-loading");
        submitButton.setAttribute("aria-busy", "true");
        setStatus("", "");

        fetch(resolvePromoApiUrl(apiEndpoint), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email }),
        })
          .then(function (response) {
            return response
              .json()
              .catch(function () {
                return { error: messages.error };
              })
              .then(function (data) {
                return { ok: response.ok, data: data };
              });
          })
          .then(function (result) {
            if (!result.ok || !result.data.code) {
              setStatus(result.data.error || messages.error, "error");
              return;
            }

            var message =
              result.data.status === "resent"
                ? messages.duplicate
                : messages.success;

            showResult(container, result.data.code, message);
          })
          .catch(function () {
            setStatus(messages.error, "error");
          })
          .finally(function () {
            submitButton.disabled = false;
            submitButton.classList.remove("is-loading");
            submitButton.removeAttribute("aria-busy");
          });
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPromoCodeForms);
  } else {
    initPromoCodeForms();
  }

  document.addEventListener("shopify:section:load", initPromoCodeForms);
})();
