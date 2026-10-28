// Deploy SECOND, after auth0-mfa-action.js. New challengeWith/enrollWith pause
// the pipeline before this Action, so completed MFA is present in the event.
exports.onExecutePostLogin = async (event, api) => {
  const namespace = "https://buildwatch.app/";
  const methods = event.authentication?.methods || [];
  if (
    event.user.app_metadata?.buildwatch_admin === true &&
    !methods.some((method) => method.name === "mfa")
  ) {
    api.access.deny(
      "Complete multifactor authentication before using BuildWatch administrator access.",
    );
    return;
  }
  api.accessToken.setCustomClaim(
    namespace + "auth_time",
    Math.floor(Date.parse(methods[0]?.timestamp || "") / 1000) || 0,
  );
  api.accessToken.setCustomClaim(namespace + "email", event.user.email);
  api.accessToken.setCustomClaim(
    namespace + "email_verified",
    event.user.email_verified === true,
  );
  api.accessToken.setCustomClaim(
    namespace + "name",
    event.user.name || event.user.email,
  );
  api.accessToken.setCustomClaim(
    namespace + "methods",
    (event.user.identities || []).map((identity) => identity.provider),
  );
  api.accessToken.setCustomClaim(namespace + "auth_methods", methods);
};
