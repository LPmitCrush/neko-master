package agent

import (
	"testing"
	"time"

	"github.com/foru17/neko-master/apps/agent/internal/config"
	"github.com/foru17/neko-master/apps/agent/internal/domain"
)

func TestIngestSnapshotsDeltaCalculation(t *testing.T) {
	runner := NewRunner(config.Config{
		ServerAPIBase:       "http://localhost:3000/api",
		BackendID:           1,
		BackendToken:        "token",
		AgentID:             "agent-test",
		GatewayType:         "surge",
		GatewayEndpoint:     "http://127.0.0.1:9091/v1/requests/recent",
		ReportInterval:      time.Second,
		HeartbeatInterval:   time.Second,
		GatewayPollInterval: time.Second,
		RequestTimeout:      time.Second,
		ReportBatchSize:     100,
		MaxPendingUpdates:   1000,
		StaleFlowTimeout:    time.Minute,
	})

	runner.ingestSnapshots([]domain.FlowSnapshot{{
		ID:       "flow-1",
		Upload:   10,
		Download: 20,
		Chains:   []string{"Proxy"},
		Rule:     "MATCH",
	}}, 1000)

	first := runner.takeBatch(10)
	if len(first) != 1 {
		t.Fatalf("expected first batch len 1, got %d", len(first))
	}
	if first[0].Upload != 10 || first[0].Download != 20 {
		t.Fatalf("expected first delta 10/20, got %d/%d", first[0].Upload, first[0].Download)
	}

	runner.ingestSnapshots([]domain.FlowSnapshot{{
		ID:       "flow-1",
		Upload:   25,
		Download: 50,
		Chains:   []string{"Proxy"},
		Rule:     "MATCH",
	}}, 2000)

	second := runner.takeBatch(10)
	if len(second) != 1 {
		t.Fatalf("expected second batch len 1, got %d", len(second))
	}
	if second[0].Upload != 15 || second[0].Download != 30 {
		t.Fatalf("expected second delta 15/30, got %d/%d", second[0].Upload, second[0].Download)
	}

	runner.ingestSnapshots([]domain.FlowSnapshot{{
		ID:       "flow-1",
		Upload:   5,
		Download: 3,
		Chains:   []string{"Proxy"},
		Rule:     "MATCH",
	}}, 3000)

	third := runner.takeBatch(10)
	if len(third) != 0 {
		t.Fatalf("expected third batch len 0 when counters reset, got %d", len(third))
	}
}
