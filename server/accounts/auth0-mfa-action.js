// Deploy as the FIRST BuildWatch Post Login Action, before auth0-action.js.
// Enable the authenticator OTP factor and New Universal Login in Auth0.
exports.onExecutePostLogin = async (event, api) => {
  if (event.user.app_metadata?.buildwatch_admin !== true) return;
  // Refresh grants cannot launch an interactive challenge. The following claims
  // Action still refuses an admin token without verified MFA authentication.
  if (event.transaction?.protocol === "oauth2-refresh-token") return;
  if (
    (event.user.enrolledFactors || []).some((factor) => factor.type === "otp")
  ) {
    api.authentication.challengeWith({ type: "otp" });
  } else {
    api.authentication.enrollWith({ type: "otp" });
  }
};
