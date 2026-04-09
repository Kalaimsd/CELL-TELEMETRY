// ESP32 Cell Telemetry Node (Real Hardware Reading)
// This code reads actual sensor data for a 3.2V nominal LiFePO4 cell
// and outputs it via Serial in the exact CSV format:
// time,voltage,current,soc,temp,chg_relay_state,discharge_relay_state

// --- Hardware Pin Definitions ---
const int VOLTAGE_PIN = 34;      // Analog pin for Voltage measurement
const int CURRENT_PIN = 35;      // Analog pin for Current measurement (e.g., ACS712)
const int TEMP_PIN = 32;         // Analog pin for Temperature (e.g., NTC Thermistor)
const int CHG_RELAY_PIN = 26;    // Digital output pin for Charge Relay
const int DISCHG_RELAY_PIN = 27; // Digital output pin for Discharge Relay

// --- Timing ---
unsigned long lastUpdate = 0;
const unsigned long INTERVAL_MS = 1000; // Send data every 1 second

void setup() {
  // Initialize Serial Monitor at 115200 baud rate
  Serial.begin(115200);
  
  // Initialize Relay Pins
  pinMode(CHG_RELAY_PIN, OUTPUT);
  pinMode(DISCHG_RELAY_PIN, OUTPUT);

  // Set initial relay states (0 = off, 1 = on)
  digitalWrite(CHG_RELAY_PIN, LOW);
  digitalWrite(DISCHG_RELAY_PIN, LOW);
}

void loop() {
  unsigned long currentMillis = millis();

  if (currentMillis - lastUpdate >= INTERVAL_MS) {
    lastUpdate = currentMillis;

    // 1. Time (milliseconds since boot)
    unsigned long time_ms = currentMillis;

    // 2. Voltage (LiFePO4 3.2V Nominal, Max 3.65V)
    // ESP32 ADC is 0-4095 for ~0-3.3V. 
    // Since 3.65V > 3.3V, you MUST use a voltage divider (e.g., two 10k resistors = 1/2 divider).
    int rawVoltage = analogRead(VOLTAGE_PIN);
    // Formula: (Raw / Max_ADC) * VRef * Divider_Ratio
    float voltage = (rawVoltage / 4095.0) * 3.3 * 2.0; 

    // 3. Current (Example using ACS712 20A sensor)
    // ACS712 outputs VCC/2 (1.65V) at 0 Amps, and changes by 100mV per Amp.
    int rawCurrent = analogRead(CURRENT_PIN);
    float currentVoltage = (rawCurrent / 4095.0) * 3.3;
    float current = (currentVoltage - 1.65) / 0.100;

    // 4. Temperature (Example: Simple linear map, replace with Steinhart-Hart for NTC)
    int rawTemp = analogRead(TEMP_PIN);
    float temp = (rawTemp / 4095.0) * 100.0; // Dummy conversion to 0-100C

    // 5. SOC (State of Charge) for LiFePO4
    // LiFePO4 has a very flat discharge curve. 
    // A simple linear estimation between 2.5V (0%) and 3.65V (100%)
    float soc = ((voltage - 2.5) / (3.65 - 2.5)) * 100.0;
    if (soc > 100.0) soc = 100.0;
    if (soc < 0.0) soc = 0.0;

    // 6 & 7. Relay States
    int chg_relay_state = digitalRead(CHG_RELAY_PIN);
    int discharge_relay_state = digitalRead(DISCHG_RELAY_PIN);

    // --- Output Data in Exact CSV Format ---
    // Format: time,voltage,current,soc,temp,chg_relay_state,discharge_relay_state
    
    Serial.print(time_ms);
    Serial.print(",");
    Serial.print(voltage, 3); // 3 decimal places
    Serial.print(",");
    Serial.print(current, 3);
    Serial.print(",");
    Serial.print(soc, 1);     // 1 decimal place
    Serial.print(",");
    Serial.print(temp, 1);
    Serial.print(",");
    Serial.print(chg_relay_state);
    Serial.print(",");
    Serial.println(discharge_relay_state); // println adds the newline character at the end
  }

  // --- Example: Read incoming commands from Serial to control relays ---
  if (Serial.available() > 0) {
    char cmd = Serial.read();
    if (cmd == 'C') {
      digitalWrite(CHG_RELAY_PIN, HIGH);
      digitalWrite(DISCHG_RELAY_PIN, LOW);
    } else if (cmd == 'D') {
      digitalWrite(CHG_RELAY_PIN, LOW);
      digitalWrite(DISCHG_RELAY_PIN, HIGH);
    } else if (cmd == 'I') {
      digitalWrite(CHG_RELAY_PIN, LOW);
      digitalWrite(DISCHG_RELAY_PIN, LOW);
    }
  }
}
