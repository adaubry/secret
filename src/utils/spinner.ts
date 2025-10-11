const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*';
const width = process.stdout.columns || 80;
const height = 10; // number of lines to show

let matrixInterval: NodeJS.Timeout | null = null;

interface Spinner {
    start: (length: number) => void;
    stop: (text?: string) => void;
}

const spinner: Spinner = {
    start: (length: number) => {
        if (matrixInterval) return; // already running

        matrixInterval = setInterval(() => {
            let line = '';
            for (let i = 0; i < length; i++) {
                line += characters[Math.floor(Math.random() * characters.length)];
            }
            process.stdout.write('\r' + line);
        }, 100); // update every 100ms
    },

    stop: () => {
        if (matrixInterval) {
            clearInterval(matrixInterval);
            matrixInterval = null;
        }
        process.stdout.write('\r'); // clear spinner line
    },
};

export default spinner;
