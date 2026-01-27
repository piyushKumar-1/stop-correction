import axios from 'axios';
import { Platform } from 'react-native';
import { API_BASE_URL as ENV_API_URL } from '@env';

// Fallback for local development if .env is missing or doesn't have the value
const DEFAULT_URL = Platform.OS === 'android'
    ? 'http://10.0.2.2:3002/api'
    : 'http://localhost:3002/api';

const API_BASE_URL = ENV_API_URL || DEFAULT_URL;

const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
});

export const stopsApi = {
    getStats: async () => {
        const response = await api.get('/stats');
        return response.data;
    },
    getStops: async (params: {
        needsCorrection?: boolean;
        isCorrected?: boolean;
        isStage?: boolean;
        search?: string;
        lat?: number;
        lon?: number;
        radius?: number;
        limit?: number;
        offset?: number;
    }) => {
        const response = await api.get('/stops', { params });
        return response.data;
    },
    getNearbyStops: async (lat: number, lon: number, radius = 500) => {
        const response = await api.get('/stops/nearby', {
            params: { lat, lon, radius }
        });
        return response.data;
    },
    submitCorrection: async (stopIds: string[], data: { lat: number, lon: number, surveyor: string, photo?: any }) => {
        const idsParam = stopIds.join(',');
        if (data.photo) {
            const formData = new FormData();
            formData.append('lat', data.lat.toString());
            formData.append('lon', data.lon.toString());
            formData.append('surveyor', data.surveyor);
            formData.append('photo', {
                uri: data.photo.uri,
                name: 'photo.jpg',
                type: 'image/jpeg',
            } as any);

            const response = await api.post(`/stops/${idsParam}/correct`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            return response.data;
        } else {
            const response = await api.patch(`/stops/${idsParam}`, {
                lat: data.lat,
                lon: data.lon,
                surveyor: data.surveyor,
            });
            return response.data;
        }
    },
    addManualStop: async (data: { name: string, lat: number, lon: number, surveyor: string, photo?: any, towardsStopId?: string, towardsStopName?: string }) => {
        const formData = new FormData();
        formData.append('name', data.name);
        formData.append('lat', data.lat.toString());
        formData.append('lon', data.lon.toString());
        formData.append('surveyor', data.surveyor);
        if (data.towardsStopId) formData.append('towardsStopId', data.towardsStopId);
        if (data.towardsStopName) formData.append('towardsStopName', data.towardsStopName);
        if (data.photo) {
            formData.append('photo', {
                uri: data.photo.uri,
                name: 'photo.jpg',
                type: 'image/jpeg',
            } as any);
        }

        const response = await api.post('/stops/manual', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    },
};

export default api;
