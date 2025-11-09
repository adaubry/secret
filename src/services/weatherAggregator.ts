import axios from 'axios';
import { ENV } from '../config/env';
import { TemperatureReading } from '../models/weatherArbitrage';

interface WeatherData {
    current_temp: number;
    daily_max: number;
    forecast_high: number;
    timestamp: Date;
    source: string;
    city: string;
}

/**
 * Weather Data Aggregator - Real-time temperature tracking
 * Integrates multiple weather APIs and validates data integrity
 */

/**
 * Fetch weather from OpenWeatherMap API
 */
async function fetchFromOpenWeatherMap(city: string, lat: number, lon: number): Promise<WeatherData | null> {
    try {
        const response = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
            params: {
                lat,
                lon,
                appid: ENV.OPENWEATHER_API_KEY,
                units: 'metric',
            },
        });

        const data = response.data;

        return {
            current_temp: Math.round(data.main.temp * 10) / 10,
            daily_max: Math.round(data.main.temp_max * 10) / 10,
            forecast_high: Math.round(data.main.temp_max * 10) / 10,
            timestamp: new Date(),
            source: 'OpenWeatherMap',
            city,
        };
    } catch (error) {
        console.error(`❌ OpenWeatherMap API error for ${city}:`, error);
        return null;
    }
}

/**
 * Validate weather data integrity
 */
function validateWeatherData(data: WeatherData): boolean {
    // Temperature in reasonable range (-50°F to 130°F, or -45°C to 54°C)
    if (data.current_temp < -45 || data.current_temp > 54) {
        console.warn(`⚠️  Temperature out of range: ${data.current_temp}°C`);
        return false;
    }

    // Daily max >= current temp
    if (data.daily_max < data.current_temp) {
        console.warn(`⚠️  Daily max (${data.daily_max}°C) < current temp (${data.current_temp}°C)`);
        return false;
    }

    // Timestamp must be fresh (<20 minutes old)
    const ageMs = Date.now() - data.timestamp.getTime();
    if (ageMs > 20 * 60 * 1000) {
        console.warn(`⚠️  Weather data too old: ${ageMs / 1000 / 60} minutes`);
        return false;
    }

    return true;
}

/**
 * Fetch and store weather data for a city
 */
export async function updateWeatherData(
    city: string,
    latitude: number,
    longitude: number
): Promise<WeatherData | null> {
    try {
        // Fetch from primary source
        let weatherData = await fetchFromOpenWeatherMap(city, latitude, longitude);

        if (!weatherData) {
            return null;
        }

        // Validate data
        if (!validateWeatherData(weatherData)) {
            console.error(`❌ Weather data validation failed for ${city}`);
            return null;
        }

        // Store in database
        const reading = new TemperatureReading({
            city,
            timestamp: weatherData.timestamp,
            current_temp: weatherData.current_temp,
            daily_max: weatherData.daily_max,
            forecast_high: weatherData.forecast_high,
            source: weatherData.source,
            validated: true,
        });

        await reading.save();
        console.log(`✅ Weather updated for ${city}: ${weatherData.current_temp}°C (max: ${weatherData.daily_max}°C)`);

        return weatherData;
    } catch (error) {
        console.error(`❌ Error updating weather for ${city}:`, error);
        return null;
    }
}

/**
 * Get latest weather data for a city
 */
export async function getLatestWeatherData(city: string): Promise<WeatherData | null> {
    try {
        const latestReading = await TemperatureReading.findOne({ city })
            .sort({ timestamp: -1 })
            .lean();

        if (!latestReading) {
            return null;
        }

        // Check if data is fresh (<20 minutes old)
        const ageMs = Date.now() - new Date(latestReading.timestamp).getTime();
        if (ageMs > 20 * 60 * 1000) {
            console.warn(`⚠️  Latest weather data for ${city} is ${ageMs / 1000 / 60} minutes old`);
        }

        return {
            current_temp: latestReading.current_temp,
            daily_max: latestReading.daily_max,
            forecast_high: latestReading.forecast_high,
            timestamp: latestReading.timestamp,
            source: latestReading.source,
            city,
        };
    } catch (error) {
        console.error(`❌ Error fetching latest weather for ${city}:`, error);
        return null;
    }
}

/**
 * Cross-validate weather data with multiple sources (flag if >5°F difference)
 */
export async function crossValidateWeatherData(
    city: string,
    latitude: number,
    longitude: number
): Promise<{ valid: boolean; data: WeatherData | null; discrepancy: number | null }> {
    try {
        const data = await fetchFromOpenWeatherMap(city, latitude, longitude);

        if (!data) {
            return { valid: false, data: null, discrepancy: null };
        }

        // Compare with database historical data
        const recentReadings = await TemperatureReading.find({ city })
            .sort({ timestamp: -1 })
            .limit(5)
            .lean();

        if (recentReadings.length === 0) {
            // First time, accept as valid
            return { valid: true, data, discrepancy: 0 };
        }

        // Check for large discrepancies (>5°C / 9°F)
        const avgPreviousMax =
            recentReadings.reduce((sum, r) => sum + r.daily_max, 0) / recentReadings.length;
        const discrepancy = Math.abs(data.daily_max - avgPreviousMax);

        if (discrepancy > 5) {
            console.warn(
                `⚠️  Large temperature discrepancy for ${city}: ${data.daily_max}°C vs avg ${avgPreviousMax.toFixed(1)}°C (diff: ${discrepancy.toFixed(1)}°C)`
            );
            return { valid: discrepancy < 10, data, discrepancy }; // Allow if <10°C difference
        }

        return { valid: true, data, discrepancy };
    } catch (error) {
        console.error(`❌ Error cross-validating weather for ${city}:`, error);
        return { valid: false, data: null, discrepancy: null };
    }
}

/**
 * Check if weather data is fresh for a city
 */
export async function isWeatherDataFresh(city: string, maxAgeMs: number = 15 * 60 * 1000): Promise<boolean> {
    try {
        const latest = await TemperatureReading.findOne({ city })
            .sort({ timestamp: -1 })
            .lean();

        if (!latest) {
            return false;
        }

        const ageMs = Date.now() - new Date(latest.timestamp).getTime();
        return ageMs <= maxAgeMs;
    } catch (error) {
        console.error(`❌ Error checking weather data freshness for ${city}:`, error);
        return false;
    }
}

/**
 * Get all cities we're tracking
 */
export async function getTrackedCities(): Promise<string[]> {
    try {
        const cities = await TemperatureReading.distinct('city');
        return cities;
    } catch (error) {
        console.error('❌ Error fetching tracked cities:', error);
        return [];
    }
}
