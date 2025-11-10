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
 * Uses OpenWeatherMap API only
 */

/**
 * Fetch weather from OpenWeatherMap API
 */
async function fetchWeather(city: string, lat: number, lon: number): Promise<WeatherData | null> {
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
        console.error(`❌ Weather API error for ${city}`);
        return null;
    }
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
        const weatherData = await fetchWeather(city, latitude, longitude);
        if (!weatherData) return null;

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
        console.log(`✅ Weather: ${city} ${weatherData.current_temp}°C (max: ${weatherData.daily_max}°C)`);

        return weatherData;
    } catch (error) {
        console.error(`❌ Weather update failed for ${city}`);
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

        return {
            current_temp: latestReading.current_temp,
            daily_max: latestReading.daily_max,
            forecast_high: latestReading.forecast_high,
            timestamp: latestReading.timestamp,
            source: latestReading.source,
            city,
        };
    } catch (error) {
        console.error(`❌ Weather fetch failed for ${city}`);
        return null;
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
