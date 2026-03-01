const API_KEY = '4d8fb5b93d4af21d66a2948710284366';
const BASE_URL = 'https://api.openweathermap.org/data/2.5/weather';

const DEFAULT_LOCATION = {
    city: 'Brasov',
    country: 'RO',
    lat: 45.6427,
    lon: 25.5887
};

const weatherIconMap = {
    '01d': '☀️',
    '01n': '🌙',
    '02d': '🌤️',
    '02n': '☁️',
    '03d': '☁️',
    '03n': '☁️',
    '04d': '☁️',
    '04n': '☁️',
    '09d': '🌧️',
    '09n': '🌧️',
    '10d': '🌦️',
    '10n': '🌧️',
    '11d': '⛈️',
    '11n': '⛈️',
    '13d': '🌨️',
    '13n': '🌨️',
    '50d': '🌫️',
    '50n': '🌫️'
};

const mapToWeatherCondition = (weatherId) => {
    if (weatherId >= 200 && weatherId < 300) return 'RAIN';
    if (weatherId >= 300 && weatherId < 400) return 'RAIN';
    if (weatherId >= 500 && weatherId < 600) return 'RAIN';
    if (weatherId >= 600 && weatherId < 700) return 'SNOW';
    if (weatherId >= 700 && weatherId < 800) return 'CLEAR';
    if (weatherId === 800) return 'CLEAR';
    if (weatherId > 800) return 'CLEAR';
    return 'CLEAR';
};

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

        const weatherData = {
            temperature: Math.round(data.main.temp),
            feelsLike: Math.round(data.main.feels_like),
            humidity: data.main.humidity,
            description: data.weather[0].description,
            icon: weatherIconMap[data.weather[0].icon] || '🌤️',
            iconCode: data.weather[0].icon,
            condition: mapToWeatherCondition(data.weather[0].id),
            windSpeed: Math.round(data.wind.speed * 3.6),
            precipitation: data.rain ? Math.round((data.rain['1h'] || 0) * 10) : 0,
            cloudiness: data.clouds.all,
            city: data.name,
            country: data.sys.country,
            sunrise: new Date(data.sys.sunrise * 1000),
            sunset: new Date(data.sys.sunset * 1000),
            timestamp: new Date()
        };

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

let cachedWeather = null;
let cacheTimestamp = null;
const CACHE_DURATION = 10 * 60 * 1000;

export const getWeatherData = async (options = {}) => {
    const now = Date.now();

    if (cachedWeather && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
        return cachedWeather;
    }

    cachedWeather = await fetchWeatherData(options);
    cacheTimestamp = now;

    return cachedWeather;
};

export const clearWeatherCache = () => {
    cachedWeather = null;
    cacheTimestamp = null;
};

export default {
    fetchWeatherData,
    getWeatherData,
    clearWeatherCache
};
