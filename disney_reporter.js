/* Node.js Script to pull real-time Walt Disney World (WDW) data 
   and log it to a Google Sheet document based on the current year.

   This version uses the stable ThemeParks.wiki API (via fetch) and includes all fixes.
*/

// --- DEPENDENCIES ---
const { GoogleSheetDB } = require('google-sheet-db'); 

// --- CONFIGURATION ---
const THEMEPARKS_API_BASE = 'https://api.themeparks.wiki/v1';

// Switched to Magic Kingdom (MK) Entity ID for more reliable 'live' data fetch
const STABLE_API_ENTITY_ID = '330339'; // Magic Kingdom ID 

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
    })); // <-- THIS CLOSING PARENTHESIS AND BRACKET MUST BE PRESENT

    console.log(`\nLogging ${dataToInsert.length} rows to Google Sheet (ID: ${CURRENT_SHEET_ID.substring(0, 8)}...).`);
    
    for (const row of dataToInsert) {
        await db.insert(row);
    }
    console.log("Sheet update successful!");
} // <-- THIS CLOSING BRACE MUST BE PRESENT

/**
 * Fetches the real-time wait status for all facilities from the ThemeParks.wiki API.
 */
async function getWaitTimeData() {
    // Use the stable Magic Kingdom (MK) live data endpoint
    const url = `${THEMEPARKS_API_BASE}/entity/${STABLE_API_ENTITY_ID}/live`;
    
    console.log(`Fetching real-time data from stable MK API endpoint: ${url}`);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`API failed with status: ${response.status}`);
        }
        const data = await response.json();
        
        const liveDataMap = new Map();
        if (data.liveData) {
            data.liveData.forEach(item => {
                liveDataMap.set(item.entityId, item);
            });
        }
        
        const results = [];
        
        for (const facility of GRAND_FLORIDIAN_FACILITIES) {
            const entry = liveDataMap.get(facility.id);
            
            let waitTime = 0;
            let status = 'UNKNOWN';
            
            if (entry && entry.queue && entry.queue.STANDBY) {
                // Wait time is found under STANDBY queue for walk-ups/rides
                waitTime = entry.queue.STANDBY.waitTime || 0;
                status = entry.queue.STANDBY.status || 'OPERATING';
            } else if (entry && entry.status) {
                 status = entry.status;
            }

            console.log(`- ${facility.name}: Status=${status}, WaitTime=${waitTime} min`);

            results.push({
                FacilityID: facility.id,
                Name: facility.name,
                WaitTimeMinutes: waitTime,
                WaitTimeStatus: status,
            });
        }
        return results;
    } catch (error) {
        console.error("Critical API fetch error:", error.message);
        // Fail gracefully for all facilities if the main API call fails
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
