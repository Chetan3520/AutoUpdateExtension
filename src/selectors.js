// Every Naukri-specific URL and selector lives here, so a Naukri layout change
// means editing this one file. Values match the working Python bot
// (D:\AutoUpdate\naukri_update.py).
export const PROFILE_URL = 'https://www.naukri.com/mnjuser/profile';

// Passed as JSON into the page (src/updater.js), so patterns are strings.
export const PAGE_CONFIG = {
  selectors: {
    headlineSection: '.widgetHead', // filtered by headlineText
    headlineEdit: ".edit, .icon.edit, span[class*='edit']",
    headlineInput: '#resumeHeadlineTxt',
  },
  headlineText: 'resume headline',
  saveButtonText: '^save$',
  loginUrl: '/nlogin/|/login',
  blockedTitle: 'access denied',
};
