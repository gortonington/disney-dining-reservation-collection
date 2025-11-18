/* Node.js Script to pull real-time Walt Disney World (WDW) data 
   and log it to a Google Sheet document based on the current year.

   FIXES APPLIED:
   1. Corrected GoogleSheetDB require statement (TypeError).
   2. Switched API call to the more stable Magic Kingdom (MK) entity ID (404 error).
*/

// --- DEPENDENCIES ---
// FIX 1: Correctly destructure the object to get the constructor
const { GoogleSheetDB } = require('google-sheet-db'); 

// --- CONFIGURATION ---
const THEMEPARKS_API_BASE = 'https://api.themeparks.wiki/v1';

// FIX 2: Switched to Magic Kingdom (MK) Entity ID for more reliable 'live' data fetch
const STABLE_API_ENTITY_ID = '330339'; // Magic Kingdom ID 

let CURRENT_SHEET_ID = null; 
const CREDENTIALS_FILE = 'google-credentials.json'; 
const FIXED_SHEET_TAB_NAME = 'Disney_Dining';

// Key Facilities/Restaurants at Grand Floridian to track (Entity IDs)
// Note: These IDs remain stable across API methods
const GRAND_FLORIDIAN_FACILITIES = [
    { name: 'Grand Floridian Cafe', id: '80010375' },
    { name: "Narcoossee's", id: '80010381' },
    { name: 'Citricos', id: '80010377' },
    { name: 'Gasparilla Island Grill', id: '80010379' },
    // Keeping a ride in for real-time validation
    { name: 'Space Mountain (MK)', id: '16975815' } 
];

// --- GLOBAL ENVIRONMENT VARIABLE PARSING ---
if (typeof process.env.YEARLY_SHEET_IDS === 'undefined') {
    console.error("FATAL ERROR: Environment variable YEARLY_SHEET_IDS is missing.");
}

let YEARLY_SHEET_IDS_MAP;
try {
    YEARLY_SHEET_IDS_MAP = JSON.parse(process.env.YEARLY_SHEET_IDS);
} catch (e) {
    console.error("FATAL ERROR: Failed to parse YEARLY_SHEET_IDS JSON environment variable.");
}

// --- CORE FUNCTIONS ---

async function getSheetInstance() {
    if (!CURRENT_SHEET_ID) {
        return null;
    }
    
    try {
        // FIX 1: GoogleSheetDB is now correctly instantiated
        const db = new GoogleSheetDB({ 
            sheetId: CURRENT_SHEET_ID,
            sheetName: FIXED_SHEET_TAB_NAME, 
            credentials: require(`./${CREDENTIALS_FILE}`),
        });
        return db;
        
    } catch (e) {
        console.error("Error connecting to Google Sheet DB. Check credentials or network.", e);
        return null;
    }
