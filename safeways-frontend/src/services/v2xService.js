import { Client } from '@stomp/stompjs';

export const createV2xClient = (onDecisionReceived, onVehiclesReceived) => {
    const client = new Client({
        brokerURL: 'ws://localhost:6767/v2x-stream',
        onConnect: () => {
            console.log('✅ Conectat la canalul V2X');
            client.subscribe('/topic/decisions', (message) => {
                if (onDecisionReceived) onDecisionReceived(JSON.parse(message.body));
            });
            client.subscribe('/topic/vehicles', (message) => {
                if (onVehiclesReceived) onVehiclesReceived(JSON.parse(message.body));
            });
        },
        onStompError: (frame) => {
            console.error('❌ Eroare V2X: ' + frame.headers['message']);
        }
    });

    return client;
};