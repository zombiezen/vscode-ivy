// Copyright 2021 Ross Light
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//		 https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// SPDX-License-Identifier: Apache-2.0

package main

import (
	"bytes"
	"os"
	"sync"
	"syscall/js"

	"robpike.io/ivy/config"
	"robpike.io/ivy/exec"
	"robpike.io/ivy/run"
	"robpike.io/ivy/value"
)

type request struct {
	vctx     value.Context
	input    string
	callback js.Value
}

var workQueue = make(chan request, 100)

var contexts struct {
	sync.Mutex
	list []value.Context
}

func newContext(this js.Value, args []js.Value) interface{} {
	cfg := new(config.Config)
	cfg.SetMobile(true)
	vctx := exec.NewContext(cfg)

	contexts.Lock()
	defer contexts.Unlock()
	contexts.list = append(contexts.list, vctx)
	return len(contexts.list) - 1
}

func destroyContext(this js.Value, args []js.Value) interface{} {
	id := args[0].Int()
	contexts.Lock()
	defer contexts.Unlock()
	if id < len(contexts.list) {
		contexts.list[id] = nil
	}
	return nil
}

func startJob(this js.Value, args []js.Value) interface{} {
	vctxID := args[0].Int()
	contexts.Lock()
	vctx := contexts.list[vctxID]
	contexts.Unlock()
	if vctx == nil {
		panic("invalid context")
	}

	req := request{
		vctx:     vctx,
		input:    args[1].String(),
		callback: args[2],
	}
	select {
	case workQueue <- req:
	default:
		panic("queue full")
	}
	return nil
}

func runJobs(done <-chan struct{}) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	for {
		select {
		case req := <-workQueue:
			run.Ivy(req.vctx, req.input, &stdout, &stderr)
			req.callback.Invoke(js.ValueOf(stdout.String()), js.ValueOf(stderr.String()))
			stdout.Reset()
			stderr.Reset()
		case <-done:
			return
		}
	}
}

func main() {
	cancel := make(chan struct{})
	js.Global().Get("_ivyCallbacks").Call(os.Getenv("IVY_CALLBACK"), map[string]interface{}{
		"run":            js.FuncOf(startJob),
		"newContext":     js.FuncOf(newContext),
		"destroyContext": js.FuncOf(destroyContext),
		"exit": js.FuncOf(func(this js.Value, args []js.Value) interface{} {
			close(cancel)
			return nil
		}),
	})
	runJobs(cancel)
}