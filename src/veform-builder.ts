// OK once home lets transfer all our logic form go code into 
// this formbuilder shit here
export type Field = {
    name: string;
    question: string;
    type: FieldType;
    validation?: FieldValidation;
    behavior?: FieldBehavior;
    
}
type FieldType = "textarea" | "select" | "yesNo" | "number" | "date" | "info";

type FieldValidation = {
    validate: boolean;
    selectOptions?: SelectOption[];
    minValue?: number;
    maxValue?: number;
}

type SelectOption = {
    label: string;
    value: string;
    readAloud?: boolean;
    behaviors?: FieldBehavior[];
}
type FieldBehavior = {
	type: string;
	moveToFieldName: string;
	output?: string;
	modifier?: string;
}

export class VeformBuilder {
    private fields: Field[] = [];
    constructor() {
        console.log("VeformBuilder constructor");
    }

    addField({name, question, type, validation, behavior}: Field): boolean {
        if (this.getField(name)) {
            console.error(`Field with name ${name} already exists`);
            return false;
        }
        if (type !== "textarea" && type !== "select" && type !== "yesNo" && type !== "number" && type !== "date" && type !== "info") {
            console.error(`Field with name ${name} has invalid type ${type}`);
            return false;
        }
        const field: Field = {
            name,
            question,
            type,
            validation,
            behavior,
        };
        this.fields.push(field);
        return true;
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


