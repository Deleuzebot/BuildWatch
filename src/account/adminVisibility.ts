/** Presentation only. Backend authorization remains required for every admin request. */
const panels=new Set(['Administrator Security','Admin Dashboard','Automation Management','Manage Users','Invite Collaborators','Review Submissions','Editing History','Potential Duplicates','Classification Review','Proposed Map Updates','Archived Projects']);
export function isAdministratorPanel(panel:string){return panels.has(panel);}
