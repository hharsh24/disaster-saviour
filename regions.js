/**
 * ══════════════════════════════════════════════════════════
 *  PRANA — India Regions Lookup
 * ══════════════════════════════════════════════════════════
 *
 *  Approximate coordinates (state capital / major city) for each state,
 *  used as the center point when generating a disaster scenario for that
 *  state via POST /api/disaster/simulate. Zones and teams are scattered
 *  randomly around this point within a realistic radius.
 *
 *  These are static, well-known geographic coordinates — not live data,
 *  so nothing here needs updating or fetching at runtime. Add more
 *  states/UTs as needed; the key is what the frontend dropdown / API
 *  caller passes as `state`.
 */

'use strict';

const REGIONS = {
  'Maharashtra':       { lat: 19.0760, lng: 72.8777 }, // Mumbai
  'Kerala':            { lat: 9.9312,  lng: 76.2673 }, // Kochi
  'Himachal Pradesh':  { lat: 31.1048, lng: 77.1734 }, // Shimla
  'Delhi':             { lat: 28.6139, lng: 77.2090 },
  'Uttarakhand':       { lat: 30.3165, lng: 78.0322 }, // Dehradun
  'Assam':             { lat: 26.1445, lng: 91.7362 }, // Guwahati
  'West Bengal':       { lat: 22.5726, lng: 88.3639 }, // Kolkata
  'Bihar':             { lat: 25.5941, lng: 85.1376 }, // Patna
  'Odisha':            { lat: 20.2961, lng: 85.8245 }, // Bhubaneswar
  'Tamil Nadu':        { lat: 13.0827, lng: 80.2707 }, // Chennai
  'Karnataka':         { lat: 12.9716, lng: 77.5946 }, // Bengaluru
  'Gujarat':           { lat: 23.0225, lng: 72.5714 }, // Ahmedabad
  'Rajasthan':         { lat: 26.9124, lng: 75.7873 }, // Jaipur
  'Punjab':            { lat: 30.7333, lng: 76.7794 }, // Chandigarh
  'Madhya Pradesh':    { lat: 23.2599, lng: 77.4126 }, // Bhopal
  'Uttar Pradesh':     { lat: 26.8467, lng: 80.9462 }, // Lucknow
  'Andhra Pradesh':    { lat: 16.5062, lng: 80.6480 }, // Vijayawada
  'Telangana':         { lat: 17.3850, lng: 78.4867 }, // Hyderabad
  'Jammu and Kashmir': { lat: 34.0837, lng: 74.7973 }, // Srinagar
  'Sikkim':            { lat: 27.3389, lng: 88.6065 }, // Gangtok
  'Goa':               { lat: 15.4909, lng: 73.8278 }, // Panaji
  'Jharkhand':         { lat: 23.3441, lng: 85.3096 }, // Ranchi
  'Chhattisgarh':      { lat: 21.2514, lng: 81.6296 }, // Raipur
};

function listRegions() {
  return Object.keys(REGIONS).map(name => ({ name, ...REGIONS[name] }));
}

function getRegion(name) {
  return REGIONS[name] || null;
}

module.exports = { REGIONS, listRegions, getRegion };
