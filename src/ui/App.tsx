import * as Tooltip from "@radix-ui/react-tooltip";
import { Pause, Play, RotateCcw, StepBack, StepForward } from "lucide-react";
import { useMemo } from "react";
import type { StageName } from "../core";
import type { ExecutedLine } from "./asmLanguage";
import { CodePane } from "./components/CodePane";
import { PipelinePanel } from "./components/PipelinePanel";
import { ProgramSwitcher } from "./components/ProgramSwitcher";
import { StateStrip } from "./components/StateStrip";
import { ToolbarButton } from "./components/ToolbarButton";
import { UndoToast } from "./components/UndoToast";
import { usePrograms } from "./hooks/usePrograms";
import { useSimulationSession } from "./hooks/useSimulationSession";
import { useWorkbenchLayout } from "./hooks/useWorkbenchLayout";

const STAGE_ORDER: StageName[] = ["IF", "ID", "EX", "MEM", "WB"];

export function App() {
  const programLibrary = usePrograms();
  const { programs, selectedProgram, statuses: programStatuses, recentlyDeleted } = programLibrary;
  const session = useSimulationSession({
    programId: selectedProgram?.id ?? "",
    source: selectedProgram?.source ?? "",
  });
  const workbenchLayout = useWorkbenchLayout();
  const { dimensions, layout } = workbenchLayout;
  const {
    assembled,
    canStep,
    cursor,
    invalidated,
    running,
    selectedCell,
    selectedEvents,
    simulation,
    timelineCells,
    viewSnapshot,
  } = session;
  const lintCount = assembled.ok ? 0 : assembled.errors.length;
  // Lines occupied by in-flight instructions at the cursor cycle. Later
  // stages come last so their tint wins when one line holds two stages.
  const executedLines = useMemo<ExecutedLine[]>(
    () =>
      STAGE_ORDER.flatMap((stage) => {
        const line = viewSnapshot.stages[stage]?.instruction?.source.line;
        return line === undefined ? [] : [{ line, stage }];
      }),
    [viewSnapshot],
  );

  return (
    <Tooltip.Provider>
      <div className="app-shell">
        <header className="toolbar">
          <div className="brand">CPU Pipeline Playground</div>
          <ProgramSwitcher
            programs={programs}
            selectedProgram={selectedProgram}
            statuses={programStatuses}
            invalidated={invalidated}
            onSelect={programLibrary.actions.selectProgram}
            onCreate={programLibrary.actions.createNewProgram}
            onDuplicate={programLibrary.actions.duplicateSelectedProgram}
            onRename={programLibrary.actions.renameProgram}
            onDelete={programLibrary.actions.deleteProgram}
            onRestoreInitialSamples={programLibrary.actions.restoreInitialPrograms}
          />
          <div className="toolbar-spacer" />
          <ToolbarButton label="Reset" onClick={session.actions.reset} disabled={!assembled.ok}>
            <RotateCcw size={16} />
          </ToolbarButton>
          <ToolbarButton label="Back" onClick={session.actions.stepBack} disabled={invalidated || cursor === 0}>
            <StepBack size={16} />
          </ToolbarButton>
          <ToolbarButton label="Step" onClick={session.actions.step} disabled={!canStep}>
            <StepForward size={16} />
          </ToolbarButton>
          <ToolbarButton
            label={running ? "Pause" : "Run"}
            onClick={session.actions.toggleRun}
            disabled={!running && !canStep}
          >
            {running ? <Pause size={16} /> : <Play size={16} />}
          </ToolbarButton>
        </header>

        <main
          className="workbench"
          style={{
            gridTemplateColumns: `${layout.codeOpen ? layout.codeWidth : dimensions.codeRailWidth}px minmax(0, 1fr)`,
          }}
        >
          <CodePane
            open={layout.codeOpen}
            onOpenChange={workbenchLayout.actions.setCodeOpen}
            onResizeStart={workbenchLayout.actions.startCodeResize}
            invalidated={invalidated}
            lintCount={lintCount}
            source={selectedProgram.source}
            executedLines={executedLines}
            onSourceChange={(value) => programLibrary.actions.updateSelectedProgram({ source: value })}
          />
          <section
            className="observe-pane"
            style={{
              gridTemplateRows: `minmax(0, 1fr) ${layout.stateOpen ? layout.stateHeight : dimensions.stateRailHeight}px`,
            }}
          >
            <PipelinePanel
              assembled={assembled}
              cells={timelineCells}
              current={simulation.current}
              cursor={cursor}
              invalidated={invalidated}
              onClearSelection={session.actions.clearSelection}
              onCursorChange={session.actions.setCursor}
              onJumpToLatest={session.actions.jumpToLatest}
              onSelectCell={session.actions.selectCell}
              selectedCell={selectedCell}
              selectedEvents={selectedEvents}
            />
            <StateStrip
              activeTab={layout.stateTab}
              open={layout.stateOpen}
              onTabChange={workbenchLayout.actions.selectStateTab}
              onOpenChange={workbenchLayout.actions.setStateOpen}
              onResizeStart={workbenchLayout.actions.startStateResize}
              registerNames={layout.registerNames}
              onRegisterNamesChange={workbenchLayout.actions.setRegisterNames}
              snapshot={viewSnapshot}
            />
          </section>
        </main>

        {recentlyDeleted && (
          <UndoToast
            key={recentlyDeleted.program.id}
            message={`Deleted "${recentlyDeleted.program.name}"`}
            onUndo={programLibrary.actions.undoDelete}
            onDismiss={programLibrary.actions.dismissDeleted}
          />
        )}
      </div>
    </Tooltip.Provider>
  );
}
