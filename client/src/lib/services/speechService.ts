class SpeechNavigationService {
	private isMuted: boolean = false;
	private voice: SpeechSynthesisVoice | null = null;
	private lastSpokenText: string = '';
	private lastSpokenTime: number = 0;

	constructor() {
		this.initVoices();
	}

	private initVoices() {
		if (typeof window === 'undefined' || !window.speechSynthesis) {
			return;
		}

		const loadVoices = () => {
			const voices = window.speechSynthesis.getVoices();
			// Try to find natural English (US / UK / PH / AU) voice
			const preferred = voices.find(
				(v) =>
					v.lang.startsWith('en') &&
					(v.name.includes('Natural') ||
						v.name.includes('Google') ||
						v.name.includes('Samantha') ||
						v.name.includes('David'))
			);
			this.voice = preferred || voices.find((v) => v.lang.startsWith('en')) || voices[0] || null;
		};

		loadVoices();
		if (window.speechSynthesis.onvoiceschanged !== undefined) {
			window.speechSynthesis.onvoiceschanged = loadVoices;
		}
	}

	public setMuted(muted: boolean) {
		this.isMuted = muted;
		if (muted && typeof window !== 'undefined' && !!window.speechSynthesis) {
			window.speechSynthesis.cancel();
		}
	}

	public getIsMuted(): boolean {
		return this.isMuted;
	}

	public cancel() {
		if (typeof window !== 'undefined' && !!window.speechSynthesis) window.speechSynthesis.cancel();
	}

	public speak(text: string, options?: { priority?: boolean; rate?: number; pitch?: number }) {
		if (this.isMuted || typeof window === 'undefined' || !window.speechSynthesis) {
			return;
		}

		// Debounce duplicate utterances within 4 seconds unless it's a high priority alert
		const now = Date.now();
		if (!options?.priority && text === this.lastSpokenText && now - this.lastSpokenTime < 4000) {
			return;
		}

		this.lastSpokenText = text;
		this.lastSpokenTime = now;

		if (options?.priority) {
			window.speechSynthesis.cancel(); // Clear any ongoing guidance for urgent flood warning
		}

		const utterance = new SpeechSynthesisUtterance(text);
		if (this.voice) {
			utterance.voice = this.voice;
		}
		utterance.rate = options?.rate ?? 1.0;
		utterance.pitch = options?.pitch ?? (options?.priority ? 1.15 : 1.0);

		window.speechSynthesis.speak(utterance);
	}

	public speakNavigationTurn(instruction: string, distanceMeters?: number) {
		let prompt = instruction;
		if (distanceMeters && distanceMeters > 0) {
			prompt = `In ${distanceMeters} meters, ${instruction}`;
		}
		this.speak(prompt, { priority: false });
	}

	public testVoice(): boolean {
		if (typeof window === 'undefined' || !window.speechSynthesis) {
			return false;
		}
		this.speak('FloodNav voice navigation system is online and ready. Safe travels!', {
			priority: true
		});
		return true;
	}
}

export const speechService = new SpeechNavigationService();
