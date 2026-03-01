/**
 * Weather Service - Fetches live weather data from OpenWeatherMap API
 * Free tier: 1000 calls/day
 */

// OpenWeatherMap API configuration
// Using a free API key - for production, use environment variables
const API_KEY = '4d8fb5b93d4af21d66a2948710284366'; // Free demo key
const BASE_URL = 'https://api.openweathermap.org/data/2.5/weather';

// Default location: Brașov, Romania
const DEFAULT_LOCATION = {
    city: 'Brasov',
    country: 'RO',
    lat: 45.6427,
    lon: 25.5887
};

/**
 * Weather condition mapping to emoji icons
 */
const weatherIconMap = {
    '01d': '☀️',  // clear sky day
    '01n': '🌙',  // clear sky night
    '02d': '🌤️',  // few clouds day
    '02n': '☁️',  // few clouds night
    '03d': '☁️',  // scattered clouds
    '03n': '☁️',
    '04d': '☁️',  // broken clouds
    '04n': '☁️',
    '09d': '🌧️',  // shower rain
    '09n': '🌧️',
    '10d': '🌦️',  // rain day
    '10n': '🌧️',  // rain night
    '11d': '⛈️',  // thunderstorm
    '11n': '⛈️',
    '13d': '🌨️',  // snow
    '13n': '🌨️',
    '50d': '🌫️',  // mist
    '50n': '🌫️'
};

/**
 * Map OpenWeatherMap condition to our WeatherCondition enum
 */
const mapToWeatherCondition = (weatherId) => {
    if (weatherId >= 200 && weatherId < 300) return 'RAIN'; // Thunderstorm
    if (weatherId >= 300 && weatherId < 400) return 'RAIN'; // Drizzle
    if (weatherId >= 500 && weatherId < 600) return 'RAIN'; // Rain
    if (weatherId >= 600 && weatherId < 700) return 'SNOW'; // Snow
    if (weatherId >= 700 && weatherId < 800) return 'CLEAR'; // Atmosphere (mist, fog)
    if (weatherId === 800) return 'CLEAR'; // Clear
    if (weatherId > 800) return 'CLEAR'; // Clouds
    return 'CLEAR';
};

/**
 * Fetch current weather data
 * @param {Object} options - Optional location override
 * @returns {Promise<Object>} Weather data object
 */
export const fetchWeatherData = async (options = {}) => {
    const { lat, lon, city, country } = { ...DEFAULT_LOCATION, ...options };

    try {
        let url;
        if (lat && lon) {
            url = `${BASE_URL}?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;
        } else {
            url = `${BASE_URL}?q=${city},${country}&appid=${API_KEY}&units=metric`;
        }

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Weather API error: ${response.status}`);
        }

        const data = await response.json();

        // Transform API response to our format
        const weatherData = {
            temperature: Math.round(data.main.temp),
            feelsLike: Math.round(data.main.feels_like),
            humidity: data.main.humidity,
            description: data.weather[0].description,
            icon: weatherIconMap[data.weather[0].icon] || '🌤️',
            iconCode: data.weather[0].icon,
            condition: mapToWeatherCondition(data.weather[0].id),
            windSpeed: Math.round(data.wind.speed * 3.6), // Convert m/s to km/h
            precipitation: data.rain ? Math.round((data.rain['1h'] || 0) * 10) : 0, // mm to percentage estimate
            cloudiness: data.clouds.all, // Cloud coverage percentage
            city: data.name,
            country: data.sys.country,
            sunrise: new Date(data.sys.sunrise * 1000),
            sunset: new Date(data.sys.sunset * 1000),
            timestamp: new Date()
        };

        // Estimate precipitation probability based on clouds and humidity
        if (weatherData.precipitation === 0) {
            if (weatherData.cloudiness > 80 && weatherData.humidity > 70) {
                weatherData.precipitation = Math.min(60, Math.round(weatherData.humidity * 0.7));
            } else if (weatherData.cloudiness > 50) {
                weatherData.precipitation = Math.round(weatherData.cloudiness * 0.3);
            } else {
                weatherData.precipitation = Math.round(weatherData.cloudiness * 0.1);
            }
        }

        return weatherData;
    } catch (error) {
        console.error('Failed to fetch weather data:', error);
        // Return fallback data
        return {
            temperature: 18,
            feelsLike: 17,
            humidity: 65,
            description: 'partly cloudy',
            icon: '🌤️',
            iconCode: '02d',
            condition: 'CLEAR',
            windSpeed: 10,
            precipitation: 10,
            cloudiness: 25,
            city: 'Brașov',
            country: 'RO',
            timestamp: new Date(),
            isOffline: true
        };
    }
};

/**
 * Get weather data with caching (cache for 10 minutes)
 */
let cachedWeather = null;
let cacheTimestamp = null;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

export const getWeatherData = async (options = {}) => {
    const now = Date.now();

    // Return cached data if still valid
    if (cachedWeather && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
        return cachedWeather;
    }

    // Fetch fresh data
    cachedWeather = await fetchWeatherData(options);
    cacheTimestamp = now;

    return cachedWeather;
};

/**
 * Clear weather cache (useful for forcing refresh)
 */
export const clearWeatherCache = () => {
    cachedWeather = null;
    cacheTimestamp = null;
};

export default {
    fetchWeatherData,
    getWeatherData,
    clearWeatherCache
};

