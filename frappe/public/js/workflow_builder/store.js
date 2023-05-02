import { defineStore } from "pinia";
import { ref } from "vue";
import { get_workflow_elements } from "./utils";
import { useManualRefHistory, onKeyDown } from "@vueuse/core";

export const useStore = defineStore("workflow-builder-store", () => {
	let workflow_name = ref(null);
	let workflow_doc = ref(null);
	let workflow = ref({ elements: [], selected: null });
	let workflowfields = ref([]);
	let statefields = ref([]);
	let transitionfields = ref([]);
	let ref_history = ref(null);

	async function fetch() {
		workflow.value.elements = [];
		await frappe.model.clear_doc("Workflow", workflow_name.value);
		await frappe.model.with_doc("Workflow", workflow_name.value);

		workflow_doc.value = frappe.get_doc("Workflow", workflow_name.value);
		await frappe.model.with_doctype(workflow_doc.value.document_type);

		if (!workflowfields.value.length) {
			await frappe.model.with_doctype("Workflow");
			workflowfields.value = frappe.get_meta("Workflow").fields;
		}

		if (!statefields.value.length) {
			await frappe.model.with_doctype("Workflow Document State");
			statefields.value = frappe.get_meta("Workflow Document State").fields;
		}

		if (!transitionfields.value.length) {
			await frappe.model.with_doctype("Workflow Transition");
			transitionfields.value = frappe.get_meta("Workflow Transition").fields;
		}

		if (
			workflow_doc.value.workflow_data &&
			typeof workflow_doc.value.workflow_data == "string" &&
			JSON.parse(workflow_doc.value.workflow_data).length
		) {
			workflow.value.elements = JSON.parse(workflow_doc.value.workflow_data);
		} else {
			workflow.value.elements = get_workflow_elements(workflow_doc.value);
		}

		setup_undo_redo();
	}

	function reset_changes() {
		fetch();
	}

	async function save_changes() {
		frappe.dom.freeze(__("Saving..."));

		try {
			let doc = workflow_doc.value;
			doc.states = get_updated_states();
			doc.transitions = get_updated_transitions();
			clean_workflow_data();
			doc.workflow_data = JSON.stringify(workflow.value.elements);
			await frappe.call("frappe.client.save", { doc });
			frappe.toast("Workflow is updated successfully");
			fetch();
		} catch (e) {
			console.error(e);
		} finally {
			frappe.dom.unfreeze();
		}
	}

	function clean_workflow_data() {
		workflow.value.elements.forEach((el) => (el.selected = false));
	}

	function get_state_df(data) {
		let doc_status_map = {
			Draft: 0,
			Submitted: 1,
			Cancelled: 2,
		};
		let docfield = "Workflow Document State";
		let df = frappe.model.get_new_doc(docfield);
		df.name = frappe.utils.get_random(8);
		df.state = data.state;
		df.doc_status = doc_status_map[data.doc_status];
		df.allow_edit = data.allow_edit;
		df.update_field = data.update_field;
		df.update_value = data.update_value;
		df.is_optional_state = data.is_optional_state;
		df.next_action_email_template = data.next_action_email_template;
		df.message = data.message;
		return df;
	}

	function get_updated_states() {
		let states = [];
		workflow.value.elements.forEach((element) => {
			if (element.type == "state") {
				states.push(get_state_df(element.data));
			}
		});
		return states;
	}

	function get_transition_df({ state, action, next_state, allowed }) {
		let docfield = "Workflow Transition";
		let df = frappe.model.get_new_doc(docfield);
		df.name = frappe.utils.get_random(8);
		df.state = state;
		df.action = action;
		df.next_state = next_state;
		df.allowed = allowed;
		return df;
	}

	function get_updated_transitions() {
		let transitions = [];
		let actions = [];

		workflow.value.elements.forEach((element) => {
			if (element.type == "action") {
				actions.push(element);
			}
		});

		actions.forEach((action) => {
			transitions.push(
				get_transition_df({
					state: action.data.from,
					action: action.data.action,
					next_state: action.data.to,
					allowed: action.data.allowed,
				})
			);
		});

		return transitions;
	}

	let undo_redo_keyboard_event = onKeyDown(true, (e) => {
		if (!ref_history.value) return;
		if (e.ctrlKey || e.metaKey) {
			if (e.key === "z" && !e.shiftKey && ref_history.value.canUndo) {
				ref_history.value.undo();
			} else if (e.key === "z" && e.shiftKey && ref_history.value.canRedo) {
				ref_history.value.redo();
			}
		}
	});

	function setup_undo_redo() {
		ref_history.value = useManualRefHistory(workflow, { clone: true });

		undo_redo_keyboard_event;
	}

	return {
		workflow_name,
		workflow_doc,
		workflow,
		workflowfields,
		statefields,
		transitionfields,
		ref_history,
		fetch,
		reset_changes,
		save_changes,
		setup_undo_redo,
	};
});
