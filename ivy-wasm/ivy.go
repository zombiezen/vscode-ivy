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
	"syscall/js"

	"robpike.io/ivy/config"
	"robpike.io/ivy/exec"
	"robpike.io/ivy/run"
	"robpike.io/ivy/value"
)

type request struct {
	input    string
	callback js.Value
}

var workQueue = make(chan request, 1)

var ivyContext value.Context

func startJob(this js.Value, args []js.Value) interface{} {
	req := request{
		input:    args[0].String(),
		callback: args[1],
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
			run.Ivy(ivyContext, req.input, &stdout, &stderr)
			req.callback.Invoke(js.ValueOf(stdout.String()), js.ValueOf(stderr.String()))
			stdout.Reset()
			stderr.Reset()
		case <-done:
			return
		}
	}
}

func main() {
	cfg := new(config.Config)
	cfg.SetMobile(true)
	ivyContext = exec.NewContext(cfg)

	cancel := make(chan struct{})
	js.Global().Get("_ivyCallbacks").Call(os.Getenv("IVY_CALLBACK"), map[string]interface{}{
		"run": js.FuncOf(startJob),
		"exit": js.FuncOf(func(this js.Value, args []js.Value) interface{} {
			close(cancel)
			return nil
		}),
	})
	runJobs(cancel)
}
