import { compareVersions, satisfies } from 'compare-versions';
import './styles.scss'

const baseURL = "https://gitee.com/microblock/BetterNCMPluginsMarketData/raw/master/";

const loadOnlinePlugins = async () => {
	return await (await fetch(baseURL + "plugins.json?" + new Date().getTime())).json();
}

let currentBetterNCMVersion = await betterncm.app.getBetterNCMVersion();

async function installPlugin(plugin, onlinePlugins) {
	for (let requirement of (plugin.requirements ?? [])) {
		if (loadedPlugins[requirement]) continue;

		let requiredPlugin = onlinePlugins.find(plugin => plugin.slug === requirement);
		if (requiredPlugin) {
			const result = await installPlugin(requiredPlugin);
			if (result != "success") return result;
		} else {
			return `${plugin.name} 的依赖 ${requiredPlugin} 解析失败！插件将不会安装`;
		}
	}

	await betterncm.fs.writeFile("./plugins/" + plugin.file, await (await fetch(baseURL + plugin['file-url'])).blob());

	return "success";
}
async function deletePlugin(plugin) {
	if (!loadedPlugins[plugin.slug]) {
		if (await betterncm.fs.exists("./plugins/" + plugin.file)) {
			await betterncm.fs.remove("./plugins/" + plugin.file);
			return "success";
		}
		return "插件未安装";
	}
	let path = await betterncm.fs.readFileText(loadedPlugins[plugin.slug].pluginPath + "/.plugin.path.meta");
	if (path) {
		await betterncm.fs.remove(path);
		return "success";
	}
	return "未找到插件路径，卸载失败";
}

class PluginList extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			onlinePlugins: null,
			requireReload: false
		};
		this.requireReload = this.requireReload.bind(this);
	}

	async componentDidMount() {
		this.setState({
			onlinePlugins: await loadOnlinePlugins()
		});
	}

	requireReload() {
		this.setState({
			requireReload: true
		});
	}

	render() {
		if (!this.state.onlinePlugins) {
			return <div className="plugin-market-container loading">
				<Icon name="loading" className="spinning" />
				<div>加载插件中...</div>
			</div>;
		}
		return (
			<div className="plugin-market-container">
				{
					this.state.onlinePlugins
					.filter(
						plugin => {
							if (plugin.hide) return false;
							if (!plugin.betterncm_version) return true;
							return satisfies(currentBetterNCMVersion, plugin.betterncm_version);
						}
					)
					.sort((a, b) => {
						return a.name > b.name ? 1 : -1;
					})
					.map((plugin) => {
						return <PluginItem plugin={plugin} requireReload={this.requireReload} />;
					})
				}
				{
					this.state.requireReload ? 
						<div className="reload-notice">
							<div>插件的更改需要重载以生效</div>
							<button onClick={ async () => {
								await betterncm.app.reloadPlugins();
								document.location.reload();
							}}><Icon name="reload" /> 重载</button>
						</div>
					: null
				}

			</div>
		);
	}
}
class PluginItem extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			installed: false,
			installing: false,
			deleting: false,
			hasUpdate: false,
			requireReload: false
		};
	}

	async componentDidMount() {
		const installed = !!loadedPlugins[this.props.plugin.slug];
		this.setState({
			installed: installed
		});
		if (installed) {
			if (compareVersions(this.props.plugin.version, loadedPlugins[this.props.plugin.slug].manifest.version) > 0) {
				this.setState({
					hasUpdate: true
				});
			}
		}
	}

	async install() {
		this.setState({
			installing: true
		});
		const result = await installPlugin(this.props.plugin, this.props.onlinePlugins);
		if (result == 'success') {
			this.setState({
				installed: true,
				installing: false,
				hasUpdate: false,
				requireReload: true
			});
			this.props.requireReload();
		} else {
			this.setState({
				installing: false
			});
			console.log(result);
		}
	}

	async delete() {
		this.setState({
			deleting: true
		});
		const result = await deletePlugin(this.props.plugin);
		if (result == 'success') {
			this.setState({
				installed: false,
				deleting: false,
				hasUpdate: false,
				requireReload: true
			});
			this.props.requireReload();
		} else {
			this.setState({
				deleting: false
			});
			console.log(result);
		}
	}

	getActionbarColor () {
		if (this.state.installed) {
			if (this.state.hasUpdate) {
				return '#66ccff';
			}
			return '#ccff99';
		} else if (this.state.installing || this.state.deleting) {
			return '#ffcc22';
		}
	}

	getActionbarIconColor () {
		if (this.state.installing || this.state.deleting) {
			return '#000';
		}
		if (!this.state.installed) {
			return '#ccc';
		}
		return '#3a3a3a';
	}

	getActionButtons () {
		let buttons = [];
		if (this.state.installed) {
			buttons.push(
				this.state.deleting ? (
					<button className="plugin-action-button">
						<Icon name="loading" className="spinning" />
					</button>
				) : (
					<button className="plugin-action-button" onClick={() => { this.delete() }}>
						<Icon name="delete" />
					</button>
				)
			)
			if (this.state.hasUpdate) {
				buttons.push(
					this.state.installing ? (
						<button className="plugin-action-button">
							<Icon name="loading" className="spinning" />
						</button>
					) : (
						<button className="plugin-action-button" onClick={() => { this.install() }}>
							<Icon name="update" />
						</button>
					)
				)
			}
		} else {
			buttons.push(
				this.state.installing ? (
					<button className="plugin-action-button">
						<Icon name="loading" className="spinning" />
					</button>
				) : (
					<button className="plugin-action-button" onClick={() => { this.install() }}>
						<Icon name="download" />
					</button>
				)
			)
		}
		return buttons;
	}


	render() {
		let preview = this.props.plugin.preview ? baseURL + this.props.plugin.preview : "unset";
		let authorLink = this.props.plugin['author_link'] ?? (this.props.plugin['author_links'] ?? [])[0] ?? null;
		if (authorLink) {
			if (!authorLink.startsWith('http')) {
				authorLink = 'https://' + authorLink;
			}
			if (!authorLink.match(/^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/)) {
				authorLink = null;
			}
		}
		return (
			<div className={`plugin-item ${this.state.installing ? 'installing' : ''} ${this.state.deleting ? 'deleting' : ''}`}>
				<div className="plugin-item-preview" style={{ 'backgroundImage': `url(${ preview })`}}></div>
				<div className="plugin-item-body">
					<div className="plugin-item-info">
						<div className="plugin-item-title">{this.props.plugin.name}</div>
						<div className="plugin-item-author">
							{
								authorLink ?
								( <a onClick={ async () => {
									    await betterncm.app.exec(authorLink)
									}} target="_blank">{this.props.plugin.author}</a> ) :
								( <span>{this.props.plugin.author}</span> )
							}
						</div>
						<div className="plugin-item-description">{this.props.plugin.description}</div>
						<div className="plugin-item-version">
							{
								this.state.hasUpdate ?
								( <span><Icon name="has_update" /> { loadedPlugins[this.props.plugin.slug].manifest.version } → <span className='new-version'>{ this.props.plugin.version }</span></span> ) :
								( <span>{ this.props.plugin.version }</span> )
							}
						</div>
						{ preview != "unset" ? <div className="plugin-item-bg" style={{ 'backgroundImage': `url(${ preview })`}}></div> : null }
					</div>	
				</div>
				<div className="plugin-item-actions" style={{ backgroundColor: this.getActionbarColor(), fill: this.getActionbarIconColor() }}>
					{this.getActionButtons()}
				</div>
				<div className="plugin-item-state-indicator-container">
					{
						this.state.installed ? (
							<div className="plugin-item-state-indicator installed">
								<Icon name="circle_check" />
							</div>
						) : null
					}
				</div>
			</div>
		)
	}
}
class Icon extends React.Component {
	render() {
		let path = '';
		switch (this.props.name) {
			case "download":
				path = <path d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32V274.7l-73.4-73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l128 128c12.5 12.5 32.8 12.5 45.3 0l128-128c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L288 274.7V32zM64 352c-35.3 0-64 28.7-64 64v32c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V416c0-35.3-28.7-64-64-64H346.5l-45.3 45.3c-25 25-65.5 25-90.5 0L165.5 352H64zM432 456c-13.3 0-24-10.7-24-24s10.7-24 24-24s24 10.7 24 24s-10.7 24-24 24z"/>;
				break;
			case "loading":
				path = <path d="M222.7 32.1c5 16.9-4.6 34.8-21.5 39.8C121.8 95.6 64 169.1 64 256c0 106 86 192 192 192s192-86 192-192c0-86.9-57.8-160.4-137.1-184.1c-16.9-5-26.6-22.9-21.5-39.8s22.9-26.6 39.8-21.5C434.9 42.1 512 140 512 256c0 141.4-114.6 256-256 256S0 397.4 0 256C0 140 77.1 42.1 182.9 10.6c16.9-5 34.8 4.6 39.8 21.5z"/>;
				break;
			case "delete":
				path = <path d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 46.3-19.7 47.9-45L416 128z"/>;
				break;
			case "github":
				path = <path d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3.3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3zm44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9.3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3.7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9 1.6 1 3.6.7 4.3-.7.7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3.7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3.7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z"/>;
				break;
			case "update":
				path = <path d="M246.6 41.4c-12.5-12.5-32.8-12.5-45.3 0l-160 160c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L224 109.3 361.4 246.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-160-160zm160 352l-160-160c-12.5-12.5-32.8-12.5-45.3 0l-160 160c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L224 301.3 361.4 438.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3z"/>;
				break;
			case "circle_check":
				path = <path d="M256 512c141.4 0 256-114.6 256-256S397.4 0 256 0S0 114.6 0 256S114.6 512 256 512zM369 209L241 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L335 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/>;
				break;
			case "has_update":
				path = <path d="M142.9 142.9c62.2-62.2 162.7-62.5 225.3-1L327 183c-6.9 6.9-8.9 17.2-5.2 26.2s12.5 14.8 22.2 14.8H463.5c0 0 0 0 0 0H472c13.3 0 24-10.7 24-24V72c0-9.7-5.8-18.5-14.8-22.2s-19.3-1.7-26.2 5.2L413.4 96.6c-87.6-86.5-228.7-86.2-315.8 1C73.2 122 55.6 150.7 44.8 181.4c-5.9 16.7 2.9 34.9 19.5 40.8s34.9-2.9 40.8-19.5c7.7-21.8 20.2-42.3 37.8-59.8zM16 312v7.6 .7V440c0 9.7 5.8 18.5 14.8 22.2s19.3 1.7 26.2-5.2l41.6-41.6c87.6 86.5 228.7 86.2 315.8-1c24.4-24.4 42.1-53.1 52.9-83.7c5.9-16.7-2.9-34.9-19.5-40.8s-34.9 2.9-40.8 19.5c-7.7 21.8-20.2 42.3-37.8 59.8c-62.2 62.2-162.7 62.5-225.3 1L185 329c6.9-6.9 8.9-17.2 5.2-26.2s-12.5-14.8-22.2-14.8H48.4h-.7H40c-13.3 0-24 10.7-24 24z"/>
				break;
			case "reload":
				path = <path d="M463.5 224H472c13.3 0 24-10.7 24-24V72c0-9.7-5.8-18.5-14.8-22.2s-19.3-1.7-26.2 5.2L413.4 96.6c-87.6-86.5-228.7-86.2-315.8 1c-87.5 87.5-87.5 229.3 0 316.8s229.3 87.5 316.8 0c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0c-62.5 62.5-163.8 62.5-226.3 0s-62.5-163.8 0-226.3c62.2-62.2 162.7-62.5 225.3-1L327 183c-6.9 6.9-8.9 17.2-5.2 26.2s12.5 14.8 22.2 14.8H463.5z"/>
				break;
		}
		return (
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className={this.props.className}>
				{path}
			</svg>
		)
	}
}


		







plugin.onConfig((tools) => {
	let dom = document.createElement('div');
	ReactDOM.render(<PluginList />, dom);
	return dom;
});