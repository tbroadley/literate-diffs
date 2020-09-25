import { throttle } from 'lodash';
import flatMap from 'lodash/flatMap';
import fetch from 'node-fetch';
import parseDiff from 'parse-diff';
import React, { Component } from 'react';
import { SortableContainer, arrayMove } from 'react-sortable-hoc';
import File from '../File/File';
import './App.css';

const Diff = SortableContainer(({ diff = [], changeDescription }) => (
  <div className='app'>
    {
      diff.map(({
        from,
        to,
        chunks,
        chunkIndex,
        description,
      }, index) => (
        <File
          key={`${from}-${to}-${chunkIndex}`}
          baseKey={`${from}-${to}-${chunkIndex}`}
          description={description}
          changeDescription={changeDescription}
          chunkIndex={chunkIndex}
          {...{ index, from, to, chunks }}
        />
      ))
    }
    <p>Icons made by <a href="https://www.flaticon.com/authors/freepik" title="Freepik">Freepik</a></p>
  </div>
));

class PasteDiff extends Component {
  state = { diff: "", url: "" };

  onChange = (event) => {
    this.setState({ [event.target.name]: event.target.value })
  }

  fetchDiff = async () => {
    const response = await fetch(`http://localhost:3500/github-diff?url=${encodeURIComponent(this.state.url.replace(/(\/pull\/\d+).*/, "$1.diff"))}`)
    this.props.setDiff(await response.text())
  }

  render() {
    return (
      <div className='app'>
        <p>Paste in a Git diff:</p>
        <p>
          <textarea name="diff" value={this.state.diff} onChange={this.onChange} />
        </p>
        <button onClick={() => this.props.setDiff(this.state.diff)}>Lit that diff!</button>
        <p>Or the URL of a Pull Request on GitHub:</p>
        <p>
          <input name="url" value={this.state.url} onChange={this.onChange} />
        </p>
        <button onClick={() => this.fetchDiff()}>Lit that diff!</button>
      </div>
    )
  }
}


class App extends Component {
  state = {};

  async componentDidMount() {
    const id = window.location.pathname.split('/')[2]
    if (!id) {
      return
    }

    const response = await fetch(`http://localhost:3500/diffs/${id}`)
    const { diff } = await response.json(); 
    this.setState({ id, diff })
  }

  persistDiff = throttle(async () => {
    const { id, diff } = this.state;

    if (id) {
      return fetch(
        `http://localhost:3500/diffs/${id}`,
        { method: 'PATCH', headers: { 'content-type': 'application/json'}, body: JSON.stringify({ id, diff }) }
      )
    }

    const response = await fetch(
      'http://localhost:3500/diffs',
      { method: 'POST', headers: { 'content-type': 'application/json'}, body: JSON.stringify({ diff }) }
    )
    const newId = (await response.json()).id;
    this.setState({ id: newId })
    window.history.replaceState({}, '', `/literate-diffs/${newId}`);
  }, 1000)

  onSortEnd = ({ oldIndex, newIndex }) => {
    this.setState({
      diff: arrayMove(this.state.diff, oldIndex, newIndex),
    }, () => {
      this.persistDiff();
    });
  };

  setDiff = (rawDiff) => {
    const parsedDiff = parseDiff(rawDiff);
    const diff = flatMap(parsedDiff, ({ from, to, chunks }) => {
      return chunks.map((chunk, chunkIndex) => ({ from, to, chunks: [chunk], chunkIndex, description: '' }));
    })
    this.setState({ diff }, () => {
      this.persistDiff();
    });
  }

  changeDescription = (from, to, chunkIndex, description) => {
    const file = this.state.diff.find(f => {
      return f.from === from && f.to === to && f.chunkIndex === chunkIndex;
    })

    if (!file) {
      throw new Error(`Couldn't find a file with from = ${from}, to = ${to}, and chunkIndex = ${chunkIndex}`)
    }

    file.description = description;
    this.setState({ diff: this.state.diff }, () => {
      this.persistDiff();
    })
  }

  render() {
    const { diff } = this.state;

    if (!diff) {
      return <PasteDiff setDiff={this.setDiff} />
    }

    return (
      <Diff diff={diff} onSortEnd={this.onSortEnd} changeDescription={this.changeDescription} useDragHandle />
    );
  }
}

export default App;
