import { run as runTests } from './suite';

export function run(): Promise<void> {
	return runTests();
}
