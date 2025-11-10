import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';

/**
 * Temperature API Endpoint
 * Returns latest temperature readings for all cities
 */

export async function GET() {
    try {
        await connectToDatabase();

        // Import models dynamically
        const { TemperatureReading } = await import('@/models/weatherArbitrage');

        // Get the latest temperature reading for each city
        const cities = ['London', 'New York'];
        const temperatureData = [];

        for (const city of cities) {
            const latestReading = await TemperatureReading.findOne({ city })
                .sort({ timestamp: -1 })
                .lean();

            if (latestReading) {
                const reading = latestReading as any;
                temperatureData.push({
                    city: reading.city,
                    currentTemp: reading.current_temp,
                    dailyMax: reading.daily_max,
                    forecastHigh: reading.forecast_high,
                    timestamp: reading.timestamp,
                    source: reading.source,
                    validated: reading.validated,
                });
            }
        }

        return NextResponse.json({
            success: true,
            temperatures: temperatureData,
            count: temperatureData.length,
        });
    } catch (error: any) {
        console.error('Error fetching temperature data:', error);
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        );
    }
}
