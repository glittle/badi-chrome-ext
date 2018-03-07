// popup
declare function addSamples(di: any): void;

// shared
declare var _di: any;
declare var tracker: any;
declare var _nextFilledWithEach_UsesExactMatchOnly: boolean;

declare function shallowCloneOf(a: any): any;
// declare function console.log(a: any): void;
declare function setStorage(key: string, value: any): void;
declare function getStorage<T>(key: string, defaultValue?: T): T;
declare function getMessage(key: string, obj?: any, defaultValue?: string): string;
declare function showIcon();

interface String {
  filledWithEach(a: Array<any>): string;
  filledWith(a: any, ...b: any[]): string;
}

interface HTMLElement {
  selectionStart: number;
  selectionEnd: number;
  value: string;
}

interface chrome {

}