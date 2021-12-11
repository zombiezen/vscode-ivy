# Ivy support for Visual Studio Code

This is an extension for [Visual Studio Code][]
that adds support for [Rob Pike's Ivy][] language.

[Rob Pike's Ivy]: https://github.com/robpike/ivy
[Visual Studio Code]: https://code.visualstudio.com/

## Features

- **Syntax Highlighting**
- **Notebooks**

## Requirements

Using notebooks requires Ivy to be installed:

```shell
go install robpike.io/ivy@latest
```

## Extension Settings

This extension contributes the following settings:

- `ivy.ivyPath`: Path to `ivy` binary.
