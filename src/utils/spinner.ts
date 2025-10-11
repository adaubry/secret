const frames: string[] = [
    '▰▱▱▱▱▱▱',
    '▰▰▱▱▱▱▱',
    '▰▰▰▱▱▱▱',
    '▰▰▰▰▱▱▱',
    '▰▰▰▰▰▱▱',
    '▰▰▰▰▰▰▱',
    '▰▰▰▰▰▰▰',
    '▱▱▱▱▱▱▱',
];

let i = 0;
let spinnerInterval: NodeJS.Timeout | null = null;

interface Spinner {
    start: (text?: string) => void;
    stop: (text?: string) => void;
}

const spinner: Spinner = {
    start: (text = '') => {
        process.stdout.write(text + ' ');
        spinnerInterval = setInterval(() => {
            process.stdout.write('\r' + text + ' ' + frames[i]);
            i = (i + 1) % frames.length;
        }, 200);
    },

    stop: (text = '') => {
        if (spinnerInterval) {
            clearInterval(spinnerInterval);
            spinnerInterval = null;
        }
        process.stdout.write('\r' + text + '\n');
    },
};

export default spinner;
