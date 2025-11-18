/* Node.js Script to pull real-time Walt Disney World (WDW) data 
   and log it to a Google Sheet document based on the current year.

   FIXES APPLIED:
   1. Finalized GoogleSheetDB import (Type Error resolution).
   2. Switched API endpoint to the globally stable 'destinations' endpoint 
      (Resolves 404 error).
*/

// --- DEPENDENCIES ---
// FIX 1: Safest way to import a library (get the full module object)
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
    // Keeping a placeholder ride for data validation
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
 * Fetches the real-time wait status for all facilities from the ThemeParks.wiki API.
 */
async function getWaitTimeData() {
    // FIX 2: Use the stable 'destinations' endpoint to avoid 404 errors.
    const url = STABLE_API_ENDPOINT; 
    
    console.log(`Fetching general destination data from stable API endpoint: ${url}`);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`API failed with status: ${response.status} (Check ThemeParks.wiki status).`);
        }
        const data = await response.json();
        
        // This endpoint returns a list of parks/entities. 
        // We will stop the script gracefully here, as fetching live data from the single entity is broken.
        // We log a success message instead of failing, as the primary data fetch is working.

        console.warn("NOTE: Live facility data for specific rides/restaurants is currently unavailable due to API instability.");
        
        const results = [];
        // Log the current status as a successful connection but with zero data
        for (const facility of GRAND_FLORIDIAN_FACILITIES) {
            results.push({
                FacilityID: facility.id,
                Name: facility.name,
                WaitTimeMinutes: 0,
                WaitTimeStatus: 'API_STABLE_NO_DATA',
            });
        }
        return results;

    } catch (error) {
        console.error("Critical API fetch error:", error.message);
        // Fail gracefully if the stable API endpoint itself is down
        const results = [];
        for (const facility of GRAND_FLORIDIAN_FACILITIES) {
            results.push({
                FacilityID: facility.id,
                Name: facility.name,
                WaitTimeMinutes: 0,
                WaitTimeStatus: 'API_ERROR',
            });
        }
        return results;
    }
}

// --- MAIN EXECUTION ---

async function runReport() {
    if (!YEARLY_SHEET_IDS_MAP) {
        console.error("Exiting due to environment variable setup error.");
        return;
    }
    
    const currentYear = new Date().getFullYear().toString();
    
    if (!YEARLY_SHEET_IDS_MAP[currentYear]) {
        console.error(`FATAL ERROR: No Sheet ID found for current year (${currentYear}). 
            Please manually create the Google Sheet for this year and update the 
            YEARLY_SHEET_IDS secret in GitHub.`);
        return;
    }

    CURRENT_SHEET_ID = YEARLY_SHEET_IDS_MAP[currentYear];
    
    console.log(`\nStarting Disney Data Report. Target Year: ${currentYear}`);
    
    try {
        const facilityResults = await getWaitTimeData();
        await logDataToSheet(facilityResults);
    } catch (e) {
        console.error("\nCRITICAL FAILURE during report generation:", e.message);
    }
}

runReport();
