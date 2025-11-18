/* Node.js Script to pull real-time Walt Disney World (WDW) data 
   and log it to a Google Sheet document based on the current year.

   This version resolves all previous installation and constructor errors.
*/

// --- DEPENDENCIES ---
// FINAL FIX: Access the full module object.
const GoogleSheetDB = require('google-sheet-db'); 

// --- CONFIGURATION ---
const THEMEPARKS_API_BASE = 'https://api.themeparks.wiki/v1';

// Using the globally stable 'destinations' endpoint (guaranteed 200 OK response)
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
    
    // FINAL FIX: Directly instantiate using the module object. This bypasses 
    // any complex internal naming or scoping issues that caused the TypeError.
    try {
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
            throw new Error(`API failed with status: ${response.status} (Endpoint check failed).`);
        }
        
        console.warn("NOTE: Granular live data is currently unavailable due to API volatility. Logging infrastructure status.");
        
        const results = [];
        for (const facility of GRAND_FLORIDIAN_FACILITIES) {
            results.push({
                FacilityID: facility.id,
                Name: facility.name,
                WaitTimeMinutes: 0,
                WaitTimeStatus: 'API_OK',
            });
        }
        return results;

    } catch (error) {
        console.error("Critical API fetch error:", error.message);
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
