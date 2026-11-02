import React from 'react';
import {RIGHTS} from '../shared/rights';
import {formFingerprint, rightsConfirmed, type Form} from './form';

type Props = {
	form: Form;
	setForm: React.Dispatch<React.SetStateAction<Form>>;
};

/**
 * Required confirmation that the user may use the uploaded photos / clip. The tick is
 * tied to the current media: adding or swapping a photo or the clip clears it.
 */
export const RightsCheck: React.FC<Props> = ({form, setForm}) => {
	const confirmed = rightsConfirmed(form);
	const hasMedia = form.images.length > 0 || Boolean(form.clip);
	const wasTickedForOtherMedia = form.rightsFor !== '' && !confirmed;

	return (
		<div className={`rights${confirmed ? ' ok' : ''}`} id="photo-permission">
			<p className="rights-warning">
				<strong>Photo permission.</strong> {RIGHTS.warning}
			</p>
			<label className="check rights-check">
				<input
					type="checkbox"
					checked={confirmed}
					disabled={!hasMedia}
					onChange={(e) => setForm((f) => ({...f, rightsFor: e.target.checked ? formFingerprint(f) : ''}))}
				/>
				<span>
					{RIGHTS.statement}
					<small lang="th">{RIGHTS.statementTh}</small>
				</span>
			</label>
			{wasTickedForOtherMedia ? <p className="hint warn">Your photos or clip changed. Please confirm again for the new set.</p> : null}
			{!hasMedia ? <p className="hint">Add photos first.</p> : null}
		</div>
	);
};
