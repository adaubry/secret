const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*';
const width = process.stdout.columns || 80;
const height = 10; // number of lines to show

let matrixInterval: NodeJS.Timeout | null = null;

interface Spinner {
    start: (text?: string) => void;
    stop: (text?: string) => void;
}

const spinner: Spinner = {
    start: (text = '') => {
        const lines: string[] = Array(height).fill(' '.repeat(width));

        matrixInterval = setInterval(() => {
            // Shift lines down
            lines.pop();
            let newLine = '';
            for (let i = 0; i < width; i++) {
                newLine +=
                    Math.random() < 0.1
                        ? characters[Math.floor(Math.random() * characters.length)]
                        : ' ';
            }
            lines.unshift(newLine);

            // Move cursor up and print
            process.stdout.write(text + '\x1b[H'); // move cursor to top-left
            process.stdout.write(lines.join('\n'));
        }, 100); // update every 100ms
    },

    stop: (text = '') => {
        if (matrixInterval) {
            clearInterval(matrixInterval);
            matrixInterval = null;
        }
        process.stdout.write('\x1b[0m' + test); // reset colors
        process.stdout.write('\n'); // move to next line
    },
};

export default spinner;
