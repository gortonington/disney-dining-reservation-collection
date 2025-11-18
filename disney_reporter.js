/* Node.js Script to pull real-time Walt Disney World (WDW) data 
   and log it to a Google Sheet document based on the current year.

  SETUP INSTRUCTIONS:
  1. This script REQUIRES a GitHub Secret named YEARLY_SHEET_IDS 
     that contains a JSON object mapping years to your manually created Google Sheet IDs.
     E.g., {"2025": "ABCDE12345", "2026": "FGHIJ67890"}

  2. The target sheet name (tab) will be a fixed 'Disney_Dining'.
*/

const { DisneyWorldResort } = require('themeparks');
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
        // Logging an error if connection fails (e.g., bad sheet ID, credentials issue)
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
    for (const row of dataToInsert) {
        await db.insert(row);
    }
    console.log("Sheet update successful!");
}

/**
 * Fetches the real-time wait status for the defined facilities from the unofficial WDW API.
 */
async function getWaitTimeData() {
    // Initialize the DisneyWorldResort object from the themeparks library
    const WDW = new DisneyWorldResort();
    const results = [];
    
    console.log("Fetching real-time data from WDW API...");

    for (const facility of GRAND_FLORIDIAN_FACILITIES) {
        try {
            // Fetch the full destination data, which includes current wait times
            const destinationData = await WDW.GetDestinationData();
            
            // Find the specific facility using its unique Entity ID
            const facilityEntry = destinationData.facilities.find(f => f.id === facility.id);
            
            if (facilityEntry) {
                // Extract relevant data points
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
            // Graceful error handling for API failures
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
    // Determine the dynamic sheet ID based on the current year.
    const currentYear = new Date().getFullYear().toString();
    
    // Check if the YEARLY_SHEET_IDS_MAP environment variable was properly injected by GitHub Actions.
    if (typeof YEARLY_SHEET_IDS_MAP === 'undefined') {
        console.error("FATAL ERROR: YEARLY_SHEET_IDS_MAP is not defined. The GitHub workflow setup is incorrect.");
        return;
    }
    
    const sheetIdsMap = YEARLY_SHEET_IDS_MAP;
    
    // Check if a Sheet ID exists for the current year in the map
    if (!sheetIdsMap[currentYear]) {
        console.error(`FATAL ERROR: No Sheet ID found for current year (${currentYear}). 
            Please manually create the Google Sheet for this year and update the 
            YEARLY_SHEET_IDS secret in GitHub.`);
        return;
    }

    // Assign the correct Sheet ID for the current year's file
    CURRENT_SHEET_ID = sheetIdsMap[currentYear];
    
    console.log(`\nStarting Disney Data Report. Target Year: ${currentYear}`);
    
    // 1. Fetch real-time wait time data (includes restaurant walk-up status)
    const facilityResults = await getWaitTimeData();

    // 2. Log the data to the correct Google Sheet file
    await logDataToSheet(facilityResults);
    
    console.log("\nReport complete. Check your Google Sheet document.");
}

// The workflow will inject the ID map before execution.
const YEARLY_SHEET_IDS_MAP = JSON.parse(process.env.YEARLY_SHEET_IDS);

runReport();
