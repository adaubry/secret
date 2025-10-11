import { createSpinner } from 'nanospinner';

const frames = [
    'o------',
    'oo-----',
    'ooo----',
    'oooo---',
    'ooowo--',
    'oooooo-',
    'ooooooo',
    '-------',
];

let spinnerInstance: ReturnType<typeof createSpinner> | null = null;
let frameIndex = 0;
let intervalId: NodeJS.Timeout | null = null;

const spinner = {
    start: (text = '') => {
        if (spinnerInstance) return;

        spinnerInstance = createSpinner(text).start();

        // Custom animation loop
        intervalId = setInterval(() => {
            if (!spinnerInstance) return;
            spinnerInstance.update({ text: `${text} ${frames[frameIndex]}` });
            frameIndex = (frameIndex + 1) % frames.length;
        }, 200);
    },

    stop: (text = '') => {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        if (spinnerInstance) {
            spinnerInstance.success({ text });
            spinnerInstance = null;
            frameIndex = 0;
        }
    },
};

export default spinner;
