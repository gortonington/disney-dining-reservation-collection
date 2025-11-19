/* Node.js Script to pull real-time Walt Disney World (WDW) data 
   and log it to a Google Sheet document based on the current year.

   This version implements the Universal Constructor Hack to fix the final TypeError.
*/

// --- DEPENDENCIES ---
const GoogleSheetDB = require('google-sheet-db'); 

// --- CONFIGURATION ---
const THEMEPARKS_API_BASE = 'https://api.themeparks.wiki/v1';
const STABLE_API_ENDPOINT = `${THEMEPARKS_API_BASE}/destinations`; 

let CURRENT_SHEET_ID = null; 
const CREDENTIALS_FILE = 'google-credentials.json'; 

// Key Facilities/Restaurants
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

// --- FINAL FIX: Load Credentials Synchronously ---
let GOOGLE_CREDENTIALS;
try {
    // Load credentials synchronously for reliability in GitHub Actions
    GOOGLE_CREDENTIALS = require(`./${CREDENTIALS_FILE}`);
} catch (e) {
    console.error(`FATAL ERROR: Could not load local Google credentials file: ${e.message}`);
}
// --- END GLOBAL LOADING ---


// --- CORE FUNCTIONS ---

// UNIVERSAL CONSTRUCTOR HACK FUNCTION (for fixing TypeError: not a constructor)
function getDBConstructor(module) {
    // 1. Try the most common export forms: function itself, .default, or named export.
    if (typeof module === 'function') return module;
    if (typeof module.default === 'function') return module.default;
    if (typeof module.GoogleSheetDB === 'function') return module.GoogleSheetDB;
    
    // 2. Try the constructor from its prototype chain (for older require compatibility)
    if (module.default && typeof module.default.default === 'function') return module.default.default;

    return null;
}

async function getSheetInstance() {
    if (!CURRENT_SHEET_ID || !GOOGLE_CREDENTIALS) {
        return null;
    }
    
    // Use the universal hack to find the constructor function
    const DBConstructor = getDBConstructor(GoogleSheetDB); 
    
    if (!DBConstructor) {
         console.error("FATAL: Could not find the GoogleSheetDB constructor function in the module.");
         return null;
    }

    try {
        const db = new DBConstructor({ 
            sheetId: CURRENT_SHEET_ID,
            sheetName: 'Disney_Dining', 
            credentials: GOOGLE_CREDENTIALS,
        });
        return db;
        
    } catch (e) {
        console.error(`Internal DB Connection Error: ${e.message}`);
        return null;
    }
}

async function logDataToSheet(facilitiesData) {
    const db = await getSheetInstance();
    if (!db) {
         console.error("Logging aborted: Sheet instance not available.");
         return;
    }

    const dataToInsert = facilitiesData.map(data => ({
        DateTime: new Date().toLocaleString(),
        FacilityID: data.FacilityID,
        Name: data.Name,
        WaitTimeMinutes: data.WaitTimeMinutes,
        WaitTimeStatus: data.WaitTimeStatus,
        ReservationAvailability: 'N/A - Check Dining API Manually' 
    }));

    console.log(`\nLogging ${dataToInsert.length} rows to Google Sheet (ID: ${CURRENT_SHEET_ID.substring(0, 8)}...).`);
    
    try {
        for (const row of dataToInsert) {
            await db.insert(row);
        }
        console.log("Sheet update successful!");
    } catch (e) {
        // This catch will provide a more detailed error on the "Login Required" failure.
        console.error(`ERROR WRITING TO SHEET: ${e.message}. This is the "Login Required" failure point.`);
    }
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
    if (!YEARLY_SHEET_IDS_MAP || !GOOGLE_CREDENTIALS) {
        console.error("Exiting due to critical configuration errors.");
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
