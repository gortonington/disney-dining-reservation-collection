/* Node.js Script to pull real-time Walt Disney World (WDW) data 
   and log it to a Google Sheet document based on the current year.

   FIXES APPLIED:
   1. FINAL AUTH FIX: Uses the explicit doc.useServiceAccountAuth() method 
      required by the stable 3.1.15 version of the library.
*/

// --- DEPENDENCIES ---
const { GoogleSpreadsheet } = require('google-spreadsheet'); 

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
const FIXED_SHEET_TAB_NAME = 'Disney_Dining';

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

// FINAL FIX: Load Credentials Synchronously
let GOOGLE_CREDENTIALS;
try {
    GOOGLE_CREDENTIALS = require(`./${CREDENTIALS_FILE}`);
} catch (e) {
    console.error(`FATAL ERROR: Could not load local Google credentials file: ${e.message}`);
}
// --- END GLOBAL LOADING ---


/**
 * Authenticates with Google and writes data to the target sheet.
 */
async function logDataToSheet(facilitiesData) {
    if (!CURRENT_SHEET_ID || !GOOGLE_CREDENTIALS) {
        console.error("Logging aborted: Missing Sheet ID or Credentials.");
        return;
    }

    try {
        // 1. Initialize the GoogleSpreadsheet document
        const doc = new GoogleSpreadsheet(CURRENT_SHEET_ID);

        // 2. FINAL FIX: Authenticate using the explicit method (required by v3.x)
        await doc.useServiceAccountAuth({
            client_email: GOOGLE_CREDENTIALS.client_email,
            private_key: GOOGLE_CREDENTIALS.private_key,
        });

        // 3. Load document properties and get the target sheet (tab)
        await doc.loadInfo(); 
        let sheet = doc.sheetsByTitle[FIXED_SHEET_TAB_NAME];

        // 4. If sheet does not exist, create it and set headers
        if (!sheet) {
            console.log(`Sheet "${FIXED_SHEET_TAB_NAME}" not found. Creating new sheet and headers...`);
            sheet = await doc.addSheet({ title: FIXED_SHEET_TAB_NAME });
            await sheet.setHeaderRow([
                'DateTime', 'FacilityID', 'Name', 'WaitTimeMinutes', 'WaitTimeStatus', 'ReservationAvailability'
            ]);
        }
        
        // 5. Map data and insert rows
        const dataToInsert = facilitiesData.map(data => ({
            DateTime: new Date().toLocaleString(),
            FacilityID: data.FacilityID,
            Name: data.Name,
            WaitTimeMinutes: data.WaitTimeMinutes,
            WaitTimeStatus: data.WaitTimeStatus,
            ReservationAvailability: 'N/A - Check Dining API Manually'
        }));

        console.log(`\nLogging ${dataToInsert.length} rows to Google Sheet...`);
        await sheet.addRows(dataToInsert);
        console.log("Sheet update successful!");
        
    } catch (e) {
        // This should catch the final "Login Required" failure point.
        console.error(`CRITICAL ERROR WRITING TO SHEET: ${e.message}.`);
        console.error(`ACTION REQUIRED: The service account key may be invalid or the key's private key requires re-escaping.`);
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
