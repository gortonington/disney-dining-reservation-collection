/* Node.js Script to pull real-time Walt Disney World (WDW) data 
   and log it to a Google Sheet document based on the current year.

   FIXES APPLIED:
   1. Finalized GoogleSheetDB import (Resolves TypeError).
   2. Switched API endpoint to the globally stable 'destinations' endpoint 
      (Resolves 404 API error).
*/

// --- DEPENDENCIES ---
// FIX 1: Access the full module object and rely on the internal property.
const GoogleSheetDB = require('google-sheet-db'); 

// --- CONFIGURATION ---
const THEMEPARKS_API_BASE = 'https://api.themeparks.wiki/v1';

// FIX 2: Using the globally stable 'destinations' endpoint
const STABLE_API_ENDPOINT = `${THEMEPARKS_API_BASE}/destinations`; 

let CURRENT_SHEET_ID = null; 
const CREDENTIALS_FILE = 'google-credentials.json'; 
const FIXED_SHEET_TAB_NAME = 'Disney_Dining';

// Key Facilities/Restaurants at Grand Floridian to track (Entity IDs)
const GRAND_FLORIDIAN_FACILITIES = [
    { name: 'Grand Floridian Cafe', id: '80010375' },
    { name: "Narcoossee's", id: '80010381' },
    { name: 'Citricos', id: '80010377' },
    { name: 'Gasparilla Island Grill', id: '80010379' },
    { name: 'Space Mountain (MK)', id: '16975815' } 
];

// --- GLOBAL ENVIRONMENT VARIABLE PARSING ---
if (typeof process.env.YEARLY_SHEET_IDS === 'undefined') {
    console.error("FATAL ERROR: Environment variable YEARLY_SHEET_IDS is missing.");
}

let YEARLY_SHEET_IDS_MAP;
try {
    // Parse the JSON string from the GitHub Secret
    YEARLY_SHEET_IDS_MAP = JSON.parse(process.env.YEARLY_SHEET_IDS);
} catch (e) {
    console.error("FATAL ERROR: Failed to parse YEARLY_SHEET_IDS JSON environment variable.");
}

// --- CORE FUNCTIONS ---

async function getSheetInstance() {
    if (!CURRENT_SHEET_ID) {
        return null;
    }
    
    // FIX 1: Access the constructor explicitly on the module object. 
    // This is the most resilient way to handle module import differences.
    const DBConstructor = GoogleSheetDB.GoogleSheetDB || GoogleSheetDB; 

    try {
        const db = new DBConstructor({ 
            sheetId: CURRENT_SHEET_ID,
            sheetName: FIXED_SHEET_TAB_NAME, 
            credentials: require(`./${CREDENTIALS_FILE}`),
        });
        return db;
        
    } catch (e) {
        // If this fails, the credentials or network are bad, or the constructor is named differently.
        console.error("Error connecting to Google Sheet DB. Check credentials or network.", e);
        return null;
    }
}

async function logDataToSheet(facilitiesData) {
    const db = await getSheetInstance();
    if (!db) return;

    const dataToInsert = facilitiesData.map(data => ({
        DateTime: new Date().toLocaleString(),
        FacilityID: data.FacilityID,
        Name: data.Name,
        WaitTimeMinutes: data.WaitTimeMinutes,
        WaitTimeStatus: data.WaitTimeStatus,
        ReservationAvailability: 'N/A - Check Dining API Manually' 
    }));

    console.log(`\nLogging ${dataToInsert.length} rows to Google Sheet (ID: ${CURRENT_SHEET_ID.substring(0, 8)}...).`);
    
    for (const row of dataToInsert) {
        await db.insert(row);
    }
    console.log("Sheet update successful!");
}

/**
 * Fetches data from the most stable general endpoint.
 */
async function getWaitTimeData() {
    const url = STABLE_API_ENDPOINT; 
    
    console.log(`Fetching general destination data from stable API endpoint: ${url}`);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            // This catches the 404 error we saw previously.
            throw new Error(`API failed with status: ${response.status} (Endpoint check failed).`);
