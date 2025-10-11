const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZoverwriteleftovecharactersfromp0123456789@#$%^&*';

let matrixInterval: NodeJS.Timeout | null = null;
let lastLength = 0;

interface Spinner {
    start: (length: number) => void;
    stop: () => void;
}

const spinner: Spinner = {
    start: (length: number) => {
        if (matrixInterval) return; // already running

        matrixInterval = setInterval(() => {
            let line = '';
            for (let i = 0; i < length; i++) {
                line += characters[Math.floor(Math.random() * characters.length)];
            }

            // Add spaces to overwrite leftover characters from previous frame
            const padding = ' '.repeat(Math.max(0, lastLength - line.length));
            process.stdout.write('\r' + line + padding);

            lastLength = line.length;
        }, 15); // update every 15ms
    },

    stop: () => {
        if (matrixInterval) {
            clearInterval(matrixInterval);
            matrixInterval = null;
        }
        // Clear the line completely when stopping
        process.stdout.write('\r' + ' '.repeat(lastLength) + '\r');
        lastLength = 0;
    },
};

export default spinner;
