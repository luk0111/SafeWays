import { Client } from '@stomp/stompjs';

// Aceasta clasa implementeaza capacitatea de perceptie prin mesaje V2X [cite: 7]
export const createV2xClient = (onMessageReceived) => {
    const client = new Client({
        brokerURL: 'ws://localhost:8080/v2x-stream', // URL-ul setat în Java
        onConnect: () => {
            console.log('✅ Conectat la canalul V2X');
            // Ne abonăm la deciziile luate de AI [cite: 11]
            client.subscribe('/topic/decisions', (message) => {
                onMessageReceived(JSON.parse(message.body));
            });
        },
        onStompError: (frame) => {
            console.error('❌ Eroare V2X: ' + frame.headers['message']);
        }
    });

    return client;
};