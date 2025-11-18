/* Node.js Script to pull real-time Walt Disney World (WDW) data 
   and log it to a Google Sheet document based on the current year.

   FIX: Implements a resilient strategy to find the correct WDW class name
        across different installed versions of the 'themeparks' library.
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
    
    // --- RESILIENT CLASS INITIALIZATION ---
    // Try the three most common ways the WDW resort class is exposed
    
    // 1. Try modern nested structure (e.g., v11+)
    if (Themeparks.Parks && Themeparks.Parks.WaltDisneyWorldResort) {
        WDW = new Themeparks.Parks.WaltDisneyWorldResort();
        console.log("Using Themeparks.Parks.WaltDisneyWorldResort");
    } 
    // 2. Try older direct structure (e.g., v8-v10)
    else if (Themeparks.WaltDisneyWorldResort) {
        WDW = new Themeparks.WaltDisneyWorldResort();
        console.log("Using Themeparks.WaltDisneyWorldResort");
    }
    // 3. Try legacy structure (e.g., v6)
    else if (Themeparks.WaltDisneyWorld) {
        WDW = new Themeparks.WaltDisneyWorld();
        console.log("Using Themeparks.WaltDisneyWorld");
    }
    else {
        // Fallback: If all attempts fail, the library is unusable.
        throw new TypeError("Could not find Walt Disney World Resort class in Themeparks module. The installed version is incompatible.");
    }
    
    const results = [];
    
    console.log("Fetching real-time data from WDW API...");

    for (const facility of GRAND_FLORIDIAN_FACILITIES) {
        try {
            // Note: The object structure returned by GetDestinationData() is consistent
            // enough to rely on for facility lookups, even across major versions.
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
        // Catch the explicit TypeError thrown if the WDW class could not be initialized
        if (e instanceof TypeError) {
             console.error("\nCRITICAL FAILURE during data fetch:", e.message);
             console.error("ACTION REQUIRED: The current version of 'themeparks' on npm is incompatible. Try deleting your 'package.json' and replacing it with the latest stable version manually.");
        } else {
             console.error("\nCRITICAL FAILURE during data fetch:", e.message);
        }
    }
}

runReport();
