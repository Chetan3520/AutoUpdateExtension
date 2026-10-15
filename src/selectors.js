// Every Naukri-specific URL and selector lives here, so a Naukri layout change
// means editing this one file. Values match the working Python bot
// (D:\AutoUpdate\naukri_update.py).
export const PROFILE_URL = 'https://www.naukri.com/mnjuser/profile';

export const SELECTORS = {
  headlineSection: '.widgetHead', // filtered by HEADLINE_TEXT
  headlineEdit: ".edit, .icon.edit, span[class*='edit']",
  headlineInput: '#resumeHeadlineTxt',
};

export const HEADLINE_TEXT = /resume headline/i;
export const SAVE_BUTTON_TEXT = /^save$/i;
export const LOGIN_URL_PATTERN = /\/nlogin\/|\/login/i;
export const BLOCKED_TITLE_PATTERN = /access denied/i;
