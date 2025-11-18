/* Node.js Script to pull real-time Walt Disney World (WDW) data 
   and log it to a Google Sheet document based on the current year.

   TARGET VERSION: themeparks@6.8.0
*/

// --- DEPENDENCIES ---
const Themeparks = require('themeparks'); 
const GoogleSheetDB = require('google-sheet-db');

// --- CONFIGURATION ---
const WDW_ID = '80007798';
let CURRENT_SHEET_ID = null; 
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

/**
 * Establishes connection to the correct annual Google Sheet document.
 */
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

/**
 * Logs a new row of data to the Google Sheet.
 */
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
 * Fetches the real-time wait status for the defined facilities.
 */
async function getWaitTimeData() {
    let WDW;
    
    // --- TARGETED CLASS INITIALIZATION (v6.8.0 uses Themeparks.WaltDisneyWorld) ---
    if (Themeparks.WaltDisneyWorld) {
        WDW = new Themeparks.WaltDisneyWorld();
        console.log("Using Themeparks.WaltDisneyWorld (Targeting v6.8.0 structure)");
    } else {
        // Fallback check to ensure the park class is available
        throw new TypeError("Could not find Themeparks.WaltDisneyWorld class. The installed version is incompatible or the project structure is incorrect.");
    }
    
    const results = [];
    
    console.log("Fetching real-time data from WDW API...");

    for (const facility of GRAND_FLORIDIAN_FACILITIES) {
        try {
            // Note: The object structure returned by GetDestinationData() is relied upon here.
            const destinationData = await WDW.GetDestinationData();
            
            const facilityEntry = destinationData.facilities.find(f => f.id === facility.id);
            
            if (facilityEntry) {
                const waitTime = facilityEntry.waitTime ? facilityEntry.waitTime.activeWaitTime : null;
                const status = facilityEntry.waitTime ? facilityEntry.waitTime.status : 'UNKNOWN';

                console.log(`- ${facility.name}: Status=${status}, WaitTime=${waitTime} min`);

                results.push({
                    FacilityID: facility.id,
                    Name: facility.name,
                    WaitTimeMinutes: waitTime || 0,
                    WaitTimeStatus: status,
                });
            } else {
                console.warn(`- Facility ID not found for: ${facility.name}`);
            }
        } catch (error) {
            console.error(`Error fetching data for ${facility.name}:`, error.message);
            results.push({
                FacilityID: facility.id,
                Name: facility.name,
                WaitTimeMinutes: 0,
                WaitTimeStatus: 'ERROR',
            });
        }
    }
    return results;
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
        console.log("\nReport complete. Check your Google Sheet document.");
    } catch (e) {
        console.error("\nCRITICAL FAILURE during data fetch:", e.message);
    }
}

runReport();
