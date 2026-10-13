// The ids of a work's current plot threads: the set tags are filtered against
import PlotThread from '../models/PlotThread.js';

export async function knownThreadSet(workId) {
  const rows = await PlotThread.find({ workId }).select('_id').lean();
  return new Set(rows.map((r) => r._id));
}
