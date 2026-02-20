// TMRW MOVE THESE ALL TO CLASSES THAT CAN CONVERT TO THE JSON PAYLOAD WHEN NEEDED
// then test we can actuall parse this nonsense in GO

enum FieldType {
    TEXT = "text",
    TEXTAREA = "textarea",
    SELECT = "select",
    MULTISELECT = "multiselect",
    YESNO = "yesNo",
    NUMBER = "number",
    INFO = "info"
}

type EventHandlers = {
    onFocus?: (previousName: string, nextName: string) => boolean;
    onChange?: (fieldName: string, answer: string | number | boolean) => void;
}

export abstract class Field {
    constructor(
      public name: string,
      public question: string,
      public type: FieldType,
      public eventConfig?: FieldEventConfig,
      private eventHandlers: EventHandlers = {},
    ) {}

    addBehavior(event: FieldEvents, behavior: FieldBehavior): void {
        if (!this.eventConfig) {
            this.eventConfig = {};
        }
        if (!this.eventConfig[event]) {
            this.eventConfig[event] = [];
        }
        if (behavior.type === FieldBehaviorType.MOVE_TO) {
          const existingMoveToIndex = this.eventConfig[event].findIndex(b => b.type === FieldBehaviorType.MOVE_TO)
          if (existingMoveToIndex !== -1) {
            this.eventConfig[event][existingMoveToIndex] = behavior;
          } else {
            this.eventConfig[event].push(behavior);
          }
        } else {
            this.eventConfig[event].push(behavior);
        }
    }
    onFocus(callback: EventHandlers['onFocus']) {
        this.eventHandlers.onFocus = callback;
    }
    onChange(callback: EventHandlers['onChange']) {
        this.eventHandlers.onChange = callback;
    }
}

export type FieldEventConfig = {
    [key in FieldEvents]?: FieldBehavior[];
}
enum FieldEvents {
    VALID_ANSWER = "validAnswer",
    INVALID_ANSWER = "invalidAnswer",
    MOVE_REQUESTED = "moveRequested",
    END_REQUESTED = "endRequested",
    VALID_YES_ANSWER = "validYesAnswer",
    VALID_NO_ANSWER = "validNoAnswer",
}
enum FieldBehaviorType {
    MOVE_TO = "moveTo",
    OUTPUT = "output",
}
type FieldBehavior = {
	type: FieldBehaviorType;
	moveToFieldName: string;
	output?: string;
	modifier?: string;
}

export class TextField extends Field {
    public textFieldValidation?: TextFieldValidation;
    constructor(name: string, question: string, eventConfig?: FieldEventConfig) {
        super(name, question, FieldType.TEXT, eventConfig);
    }
    addValidation(validation: TextFieldValidation): void {
        this.textFieldValidation = validation;
    }
}
type TextFieldPatterns = 'email' | 'phone' | 'url' | 'date' | 'name';
type TextFieldValidation = {
    validate: boolean;
    pattern?: TextFieldPatterns;
    readback?: boolean;
}

export class NumberField extends Field {
    public numberFieldValidation?: NumberFieldValidation;
    constructor(name: string, question: string, eventConfig?: FieldEventConfig) {
        super(name, question, FieldType.NUMBER, eventConfig);
    }
    addValidation(validation: NumberFieldValidation): void {
        this.numberFieldValidation = validation;
    }
}
type NumberFieldValidation = {
    validate: boolean;
    minValue?: number;
    maxValue?: number;
}

export class SelectField extends Field {
    public selectFieldValidation?: SelectFieldValidation;
    constructor(name: string, question: string, eventConfig?: FieldEventConfig) {
        super(name, question, FieldType.SELECT, eventConfig);
        this.selectFieldValidation = {
            validate: true,
            selectOptions: [],
        };
    }
    addSelectOption(option: SelectOption): void {
        this.selectFieldValidation?.selectOptions?.push(option);
    }
}
export type SelectOption = {
    label: string;
    value: string;
    readAloud?: boolean;
    behaviors?: FieldBehavior[];
}

type SelectFieldValidation = {
    validate: boolean;
    selectOptions?: SelectOption[];
}

export class MultiselectField extends Field {
    public multiselectFieldValidation?: SelectFieldValidation;
    constructor(name: string, question: string, eventConfig?: FieldEventConfig) {
        super(name, question, FieldType.MULTISELECT, eventConfig);
    }
    addSelectOption(option: SelectOption): void {
        this.multiselectFieldValidation?.selectOptions?.push(option);
    }
}

export class YesNoField extends Field {
    public yesNoFieldValidation?: YesNoFieldValidation;
    constructor(name: string, question: string, eventConfig?: FieldEventConfig) {
        super(name, question, FieldType.YESNO, eventConfig);
    }
    addValidation(validation: YesNoFieldValidation): void {
        this.yesNoFieldValidation = validation;
    }
}
type YesNoFieldValidation = {
    validate: boolean;
    requireYes?: boolean;
    requireNo?: boolean;
}

export class TextAreaField extends Field {
    public textAreaFieldValidation?: TextAreaFieldValidation;
    constructor(name: string, question: string, eventConfig?: FieldEventConfig) {
        super(name, question, FieldType.TEXTAREA, eventConfig);
    }
    addValidation(validation: TextAreaFieldValidation): void {
        this.textAreaFieldValidation = validation;
    }
}
type TextAreaFieldValidation = {
    validate: boolean;
    maxCharacters?: number;
    minCharacters?: number;
}

export class InfoField extends Field {
    constructor(name: string, question: string, eventConfig?: FieldEventConfig) {
        super(name, question, FieldType.INFO, eventConfig);
    }
}


export class VeformBuilder {
    private fields: Field[] = [];

    addField({name, question, type}: Field): Field | null {
        if (this.getField(name)) {
            console.error(`Field with name ${name} already exists`);
            return null;
        }
        if (name.length === 0 || question.length === 0) {
            console.error(`Field with name ${name} and question ${question} has invalid name or question`);
            return null;
        }
        let field: Field;
        switch (type) {
            case FieldType.TEXT:
                field = new TextField(name, question);
                break;
            case FieldType.TEXTAREA:
                field = new TextAreaField(name, question);
                break;
            case FieldType.SELECT:
                field = new SelectField(name, question);
                break;
            case FieldType.YESNO:
                field = new YesNoField(name, question);
                break;
            case FieldType.NUMBER:
                field = new NumberField(name, question);
                break;
            case FieldType.INFO:
                field = new InfoField(name, question);
                break;
            case FieldType.MULTISELECT:
                field = new MultiselectField(name, question);
                break;
            default:
                console.error(`Field with name ${name} has invalid type ${type}`);
                return null;
        }
        this.fields.push(field);
        return field;
    }


    getField(name: string): Field | undefined {
        return this.fields.find(field => field.name === name);
    }

    getFields(): Field[] {
        return this.fields;
    }

    setField(name: string, field: Field): boolean {
        const index = this.fields.findIndex(field => field.name === name);
        if (index !== -1) {
            this.fields[index] = field;
            return true;
        }
        return false;
    }

    removeField(name: string): boolean {
        const index = this.fields.findIndex(field => field.name === name);
        if (index !== -1) {
            this.fields.splice(index, 1);
            return true;
        }
        return false;
    }
}


