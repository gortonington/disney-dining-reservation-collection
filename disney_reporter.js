/* Node.js Script to pull real-time Walt Disney World (WDW) data 
   and log it to a Google Sheet document based on the current year.

  FIX: Corrected the import structure for the 'themeparks' library 
       to resolve the 'is not a constructor' error.

  SETUP: Requires a GitHub Secret named YEARLY_SHEET_IDS 
         with a JSON map of Year:SheetID.
*/

// --- FIX APPLIED HERE: Import the full module object ---
const Themeparks = require('themeparks'); 
const GoogleSheetDB = require('google-sheet-db');

// --- CONFIGURATION ---
// Walt Disney World Resort ID
const WDW_ID = '80007798';
// Placeholder for the dynamically determined SHEET_ID
let CURRENT_SHEET_ID = null; 
// The filename of the JSON key downloaded from GitHub Secrets
const CREDENTIALS_FILE = 'google-credentials.json'; 

// Key Facilities/Restaurants at Grand Floridian to track (Entity IDs)
const GRAND_FLORIDIAN_FACILITIES = [
    { name: 'Grand Floridian Cafe', id: '80010375' },
    { name: "Narcoossee's", id: '80010381' },
    { name: 'Citricos', id: '80010377' },
    { name: 'Gasparilla Island Grill', id: '80010379' },
    { name: 'Space Mountain (MK)', id: '16975815' } 
];

// The target sheet/tab name will be fixed for simplicity.
const FIXED_SHEET_TAB_NAME = 'Disney_Dining';

// --- CORE FUNCTIONS ---

/**
 * Connects to the dynamically selected Google Sheet document.
 */
async function getSheetInstance() {
    if (!CURRENT_SHEET_ID) {
        console.error("Error: CURRENT_SHEET_ID is null. Cannot connect to Google Sheet.");
        return null;
    }
    
    try {
        const db = new GoogleSheetDB({
            sheetId: CURRENT_SHEET_ID, // Use the dynamically set ID
            sheetName: FIXED_SHEET_TAB_NAME, 
            credentials: require(`./${CREDENTIALS_FILE}`),
        });
        return db;
        
    } catch (e) {
        console.error("Error connecting to Google Sheet DB. Check credentials or network.", e);
        return null;
    }
}

/**
 * Logs a new row of data to the Google Sheet.
 * @param {Array<Object>} facilitiesData - Array of facility data objects to log.
 */
async function logDataToSheet(facilitiesData) {
    const db = await getSheetInstance();
    if (!db) return;

    // Map the fetched data to the column headers in the Google Sheet
    const dataToInsert = facilitiesData.map(data => ({
        DateTime: new Date().toLocaleString(),
        FacilityID: data.FacilityID,
        Name: data.Name,
        WaitTimeMinutes: data.WaitTimeMinutes,
        WaitTimeStatus: data.WaitTimeStatus,
        // Reminder for manual action, as automated reservation checks are unstable/prohibited
        ReservationAvailability: 'N/A - Check Dining API Manually' 
    }));

    // Log the action to the console
    console.log(`\nLogging ${dataToInsert.length} rows to Google Sheet (ID: ${CURRENT_SHEET_ID.substring(0, 8)}...).`);
    
    // Insert row by row to ensure clean data insertion.
    for
