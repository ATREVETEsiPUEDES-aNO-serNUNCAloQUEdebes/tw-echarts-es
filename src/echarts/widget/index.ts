/* eslint-disable @typescript-eslint/lines-between-class-members */
/* eslint-disable max-lines, no-bitwise */
import type {
  IParseTreeNode,
  IWidgetInitialiseOptions,
  IChangedTiddlers,
} from 'tiddlywiki';
import type { IScriptAddon } from '../scriptAddon';
import { widget as Widget } from '$:/core/modules/widgets/widget.js';
import * as ECharts from '$:/plugins/Gk0Wk/echarts/echarts.min.js';

const Function_ = Function;
if ($tw.browser) {
  // Finalmente entender，nodeAl iniciar, esto se llamara una y otra vez en el navegador.
  // Las dos partes no son el mismo concepto
  (globalThis as any).echarts = ECharts;
  try {
    // Registre varias extensiones.
    $tw.modules.forEachModuleOfType(
      'echarts-extension',
      (title, extension: any) => {
        if (title === '$:/plugins/Gk0Wk/echarts-stat/ecStat.min.js') {
          const {
            transform: { histogram, clustering, regression },
            statistics,
          } = extension;
          (ECharts as any).registerTransform?.(histogram);
          (ECharts as any).registerTransform?.(clustering);
          (ECharts as any).registerTransform?.(regression);
          (globalThis as any).EChartsStat = statistics;
        }
      },
    );
  } catch (error) {
    console.error(error);
  }
}

const echartWidgets: Set<EChartsWidget> = new Set();
let eChartsInstanceUnmountCheckTimer: NodeJS.Timer | undefined;
const registerInstance = (instance: EChartsWidget) => {
  if (!$tw.browser || eChartsInstanceUnmountCheckTimer !== undefined) {
    return;
  }
  echartWidgets.add(instance);
  eChartsInstanceUnmountCheckTimer = setInterval(() => {
    const deletingWidget: EChartsWidget[] = [];
    for (const widget of echartWidgets) {
      if (!document.contains(widget.containerDom)) {
        unmountAddon(
          widget.tiddlerTitle,
          widget.state,
          widget.echartsInstance!,
        );
        widget.clearInstance();
        deletingWidget.push(widget);
      }
    }
    for (const echartWidget of echartWidgets) {
      echartWidgets.delete(echartWidget);
    }
    if (echartWidgets.size < 1) {
      eChartsInstanceUnmountCheckTimer = undefined;
      clearInterval(eChartsInstanceUnmountCheckTimer);
    }
  }, 1000);
};

const unmountAddon = (
  title: string | undefined,
  state: any,
  echartsInstance: ECharts.ECharts,
) => {
  try {
    echartsInstance.off('restore');
    if (
      title &&
      $tw.wiki.getTiddler(title)?.fields?.type === 'application/javascript'
    ) {
      const _addon = require(title);
      const addon = (_addon.default ?? _addon) as IScriptAddon;
      const { onUnmount } = addon;
      if (typeof onUnmount === 'function') {
        onUnmount(state);
      }
    }
  } catch (error) {
    console.error(error);
  }
};

let nextId = 0;
class EChartsWidget extends Widget {
  uuid: string = `gk0wk-echarts-container-${nextId++}`;
  containerDom!: HTMLDivElement;
  tiddlerTitle?: string;
  text?: string;
  width: string = '100%';
  height: string = '300px';
  _state?: string;
  state: any;
  class: string = 'gk0wk-echarts-body';
  fillSidebar: boolean = true;
  theme?: 'dark';
  renderer: 'svg' | 'canvas' = 'canvas';
  resizeObserver?: ResizeObserver;
  echartsInstance?: ECharts.ECharts;
  timer?: NodeJS.Timeout;
  tmpChangedTiddlers?: IChangedTiddlers;
  throttle!: number;
  skipDraftTiddle: boolean = true;

  addon?: {
    init: () => void;
    render: () => void;
    shouldUpdate: () => boolean;
    unmount: () => void;
  };

  initialise(parseTreeNode: IParseTreeNode, options: IWidgetInitialiseOptions) {
    super.initialise(parseTreeNode, options);
    this.computeAttributes();
  }

  execute() {
    this.tiddlerTitle = this.getAttribute('$tiddler', '') || undefined;
    this.width = this.getAttribute('$width', '100%');
    this.height = this.getAttribute('$height', '300px');
    this.class = this.getAttribute('$class', 'gk0wk-echarts-body');
    this.fillSidebar =
      this.getAttribute('$fillSidebar', 'true').toLowerCase() === 'true';
    switch (this.getAttribute('$theme', 'auto')) {
      case 'light': {
        this.theme = undefined;
        break;
      }
      case 'dark': {
        this.theme = 'dark';
        break;
      }
      default: {
        this.theme =
          $tw.wiki.filterTiddlers('[{$:/palette}field:color-scheme[dark]]')
            .length > 0
            ? 'dark'
            : undefined;
      }
    }
    this.renderer =
      this.getAttribute('$renderer', 'canvas') === 'svg' ? 'svg' : 'canvas';
    this.text = this.getAttribute('$text', '').trim() || undefined;

    // Configurar el rebote
    const throttleText = this.getAttribute('$throttle');
    if (throttleText) {
      const t = parseInt(throttleText, 10);
      this.throttle = Number.isSafeInteger(t) ? Math.max(0, 10) : 1000;
    } else {
      this.throttle = 1000;
    }

    this.skipDraftTiddle =
      this.getAttribute('$skipDraftTiddle', 'true') !== 'false';
  }

  render(parent: HTMLElement, nextSibling: HTMLElement) {
    this.parentDomNode = parent;
    this.execute();
    this.containerDom = $tw.utils.domMaker('div', {
      class: this.class,
      document: this.document,
      style: {
        width: this.width,
        height: this.height,
      },
    });
    this.containerDom.id = this.uuid;
    parent.insertBefore(this.containerDom, nextSibling);
    this.domNodes.push(this.containerDom);
    try {
      if (
        !(this.tiddlerTitle && $tw.wiki.getTiddler(this.tiddlerTitle)) &&
        !this.text
      ) {
        throw new Error('Widget need either $tiddler or $text attribute!');
      }
      const ssr = Boolean((parent as any).isTiddlyWikiFakeDom);
      this.rebuildInstance(ssr);
      this.initAddon();
      this.renderAddon();
      if (ssr) {
        // Si se trata de un entorno sin navegador, utilice SSR
        // https://echarts.apache.org/handbook/zh/how-to/cross-platform/server
        if (
          !Number.isSafeInteger(Number(this.width.replace('px', ''))) ||
          !Number.isSafeInteger(Number(this.height.replace('px', '')))
        ) {
          console.error(
            "If you require SSR(server side render), you need to define $height and $width with format like '300px'",
          );
        }
        this.parentDomNode.innerHTML = (
          this.echartsInstance! as any
        ).renderToSVGString();
      } else {
        registerInstance(this);
      }
    } catch (error) {
      console.error(error);
      this.containerDom.innerText = String(error);
      this.containerDom.style.color = 'white';
      this.containerDom.style.background = 'red';
      this.containerDom.style.fontSize = '12px';
    }
  }

  refresh(changedTiddlers: IChangedTiddlers) {
    if (this.timer !== undefined) {
      // Significa que ya hay un temporizador que se esta acelerando, asi que combine este cambio en el.
      if (this.tmpChangedTiddlers !== undefined) {
        this.tmpChangedTiddlers = {
          ...this.tmpChangedTiddlers,
          ...changedTiddlers,
        };
      } else {
        this.tmpChangedTiddlers = changedTiddlers;
      }
      return;
    }
    // Hazlo una vez
    this.refresh_(changedTiddlers);
    // Luego acelera
    let count = 5;
    this.timer = setInterval(() => {
      if (count-- <= 0 && this.tmpChangedTiddlers === undefined) {
        clearInterval(this.timer);
        this.timer = undefined;
      }
      if (this.tmpChangedTiddlers !== undefined) {
        this.refresh_(this.tmpChangedTiddlers);
        this.tmpChangedTiddlers = undefined;
        count = Math.min(5, count + 2);
      }
    }, this.throttle);
  }

  refresh_(changedTiddlers: IChangedTiddlers) {
    const oldAddonTitle = this.tiddlerTitle;
    const changedAttributes = this.computeAttributes();
    let refreshFlag = 0; // 0: No se requieren cambios   1: Necesidad de regenerarseOption   2: Necesidad de volver a renderizar
    // Veamos primero los cambios de parametros, que se dividen en varios tipos:：
    // $tiddlerSi cambia, significa que necesita ser regenerado.Option
    // $theme、$fillSidebar y $rendererNecesidad de reinicializar la instancia.
    // $class、$width y $height Simplemente modifique el tamano del contenedor.
    // El resto son los parametros pasados al complemento.
    if ($tw.utils.count(changedAttributes) > 0) {
      let counter = 0;
      $tw.utils.each(['$theme', '$fillSidebar', '$renderer'], key => {
        if (changedAttributes[key] !== undefined) {
          counter++;
        }
      });
      if (counter > 0) {
        refreshFlag |= 2;
      }
      if (changedAttributes.$class) {
        counter++;
        this.class = this.getAttribute('$class', 'gk0wk-echarts-body');
        this.containerDom.className = this.class;
      }
      if (changedAttributes.$width) {
        counter++;
        this.width = this.getAttribute('$width', '100%');
        this.containerDom.style.width = this.width;
      }
      if (changedAttributes.$height) {
        counter++;
        this.height = this.getAttribute('$height', '300px');
        this.containerDom.style.height = this.height;
      }
      if ($tw.utils.count(changedAttributes) > counter) {
        refreshFlag |= 1;
      }
    }
    if (
      this.text === undefined &&
      !(refreshFlag & 1) &&
      ((this.tiddlerTitle && changedTiddlers[this.tiddlerTitle]) ||
        this.askForAddonUpdate(changedTiddlers, changedAttributes))
    ) {
      refreshFlag |= 1;
    }
    // Compruebe si el modo oscuro esta activado cuando se utiliza el tema automatico.
    const oldTheme = this.theme;
    this.execute();
    if (oldTheme !== this.theme) {
      refreshFlag |= 2;
    }
    if (refreshFlag & 2) {
      const oldOption = this.rebuildInstance();
      if (!oldOption || refreshFlag & 1) {
        unmountAddon(
          this.text !== undefined ? undefined : oldAddonTitle,
          this.state,
          this.echartsInstance!,
        );
        this.initAddon();
        this.renderAddon();
      } else {
        this.echartsInstance!.setOption(oldOption);
      }
    } else if (refreshFlag & 1) {
      this.renderAddon();
    }
  }

  askForAddonUpdate(
    changedTiddlers: IChangedTiddlers,
    changedAttributes: Record<string, true>,
  ) {
    try {
      if (!this.tiddlerTitle || !$tw.wiki.getTiddler(this.tiddlerTitle)) {
        return false;
      }
      const tiddler = $tw.wiki.getTiddler(this.tiddlerTitle)!.fields;
      // Ignorar borradores
      if (this.skipDraftTiddle && tiddler['draft.of']) {
        return false;
      }
      // Modo de carga diferida, aun cargando, es necesario esperar
      if (
        '_is_skinny' in tiddler &&
        $tw.wiki.getTiddlerText(this.tiddlerTitle) === null
      ) {
        return false;
      }
      const type = tiddler.type || 'text/vnd.tiddlywiki';
      const typeInfo = $tw.config.contentTypeInfo[type] ?? {};
      const deserializerType = typeInfo.deserializerType ?? type;
      if (
        deserializerType === 'text/vnd.tiddlywiki' ||
        deserializerType === 'application/json'
      ) {
        this._state = JSON.stringify(
          $tw.wiki.filterTiddlers(tiddler['echarts-refresh-trigger'] as string),
        );
        return this._state !== this.state;
      } else if (deserializerType === 'application/javascript') {
        const _addon = require(this.tiddlerTitle);
        const addon = (_addon.default ?? _addon) as IScriptAddon;
        const shouldUpdate =
          addon.shouldUpdate ??
          ((addon as any).shouldRefresh as
            | IScriptAddon['shouldUpdate']
            | undefined);
        if (shouldUpdate === undefined) {
          return true;
        } else if (typeof shouldUpdate === 'string') {
          this._state = JSON.stringify($tw.wiki.filterTiddlers(shouldUpdate));
          return this._state !== this.state;
        } else if (typeof shouldUpdate === 'function') {
          return shouldUpdate(
            this.state,
            changedTiddlers,
            changedAttributes,
            this.attributes,
          );
        }
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  clearInstance() {
    let oldOptions;
    if (this.echartsInstance) {
      oldOptions = this.echartsInstance.getOption();
      if (!this.echartsInstance.isDisposed()) {
        this.echartsInstance.dispose();
      }
      this.echartsInstance = undefined;
    }
    this.containerDom.innerHTML = '';
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = undefined;
    }
    return oldOptions;
  }

  rebuildInstance(ssr = false) {
    const oldOptions = this.clearInstance();
    // Crea una nueva instancia
    this.echartsInstance = ECharts.init(
      (ssr ? null : this.containerDom) as HTMLDivElement,
      this.theme,
      ssr
        ? ({
            ssr: true,
            renderer: 'svg',
            height: Number(this.height.replace('px', '')) || 300,
            width: Number(this.width.replace('px', '')) || 400,
          } as any)
        : {
            renderer: this.renderer,
          },
    );
    this.echartsInstance.setOption({
      darkMode: this.theme === 'dark',
      backgroundColor: 'transparent',
    } as any);
    // Supervisar los cambios de tamano
    if (globalThis.ResizeObserver && $tw.browser && !ssr) {
      this.resizeObserver = new ResizeObserver(entries => {
        requestAnimationFrame(() => {
          if (this.echartsInstance) {
            const sidebar = document.querySelector('.tc-sidebar-scrollable');
            let { height } = entries[0].contentRect;
            if (this.fillSidebar && sidebar?.contains?.(this.containerDom)) {
              height =
                window.innerHeight -
                this.parentDomNode.getBoundingClientRect().top -
                (Number(
                  getComputedStyle(sidebar).paddingBottom.replace('px', ''),
                ) || 0);
            }
            this.echartsInstance.resize({
              width: entries[0].contentRect.width,
              height,
            });
          }
        });
      });
      this.resizeObserver.observe(this.containerDom);
    }
    return oldOptions;
  }

  // Inicializacionaddon
  initAddon() {
    try {
      if (this.text === undefined) {
        if (!this.tiddlerTitle || !$tw.wiki.getTiddler(this.tiddlerTitle)) {
          return;
        }
        const tiddler = $tw.wiki.getTiddler(this.tiddlerTitle)!.fields;
        // Modo de carga diferida, aun cargando, es necesario esperar
        if (
          '_is_skinny' in tiddler &&
          $tw.wiki.getTiddlerText(this.tiddlerTitle) === null
        ) {
          return;
        }
        const type = tiddler.type || 'text/vnd.tiddlywiki';
        const typeInfo = $tw.config.contentTypeInfo[type] ?? {};
        const deserializerType = typeInfo.deserializerType ?? type;
        if (
          deserializerType === 'text/vnd.tiddlywiki' ||
          deserializerType === 'application/json'
        ) {
          this.state =
            this._state ??
            JSON.stringify(
              $tw.wiki.filterTiddlers(
                tiddler['echarts-refresh-trigger'] as string,
              ),
            );
          this._state = undefined;
        } else if (deserializerType === 'application/javascript') {
          const _addon = require(this.tiddlerTitle);
          const addon = (_addon.default ?? _addon) as IScriptAddon;
          const onMount = addon.onMount ?? (addon as any).onInit;
          if (typeof onMount === 'function') {
            this.state = onMount(this.echartsInstance, this.attributes, this);
          }
        } else {
          return;
        }
      }
      this.echartsInstance!.on('restore', () => this.renderAddon());
    } catch (error) {
      console.error(error);
    }
  }

  // Actualizaciones asincronicas
  async renderAddon() {
    // when upgrading plugin, this maybe unloaded to be undefined.
    if (!this.echartsInstance) {
      return;
    }
    this.echartsInstance.showLoading();
    try {
      if (this.text === undefined) {
        if (!this.tiddlerTitle || !$tw.wiki.getTiddler(this.tiddlerTitle)) {
          this.echartsInstance.hideLoading();
          return;
        }
        const tiddler = $tw.wiki.getTiddler(this.tiddlerTitle)!.fields;
        // Modo de carga diferida, aun cargando, es necesario esperar
        if (
          '_is_skinny' in tiddler &&
          $tw.wiki.getTiddlerText(this.tiddlerTitle) === null
        ) {
          return;
        }
        const type = tiddler.type || 'text/vnd.tiddlywiki';
        const typeInfo = $tw.config.contentTypeInfo[type] ?? {};
        const deserializerType = typeInfo.deserializerType ?? type;
        if (deserializerType === 'text/vnd.tiddlywiki') {
          const plainTextContent = $tw.wiki.renderTiddler(
            'text/plain',
            this.tiddlerTitle,
            {
              variables: this.attributes,
            },
          );
          // Allow using js style key without `""`, and allow list to have tailing comma, and allow having `//`
          const executedJSContent = new Function_(
            `return (${plainTextContent})`,
          )();
          this.echartsInstance.setOption(executedJSContent);
        } else if (deserializerType === 'application/json') {
          this.echartsInstance.setOption(
            JSON.parse($tw.wiki.getTiddlerText(this.tiddlerTitle)!),
          );
        } else if (deserializerType === 'application/javascript') {
          const _addon = require(this.tiddlerTitle);
          const addon = (_addon.default ?? _addon) as IScriptAddon;
          addon.onUpdate(this.echartsInstance, this.state, this.attributes);
        }
      } else {
        const addon = new Function_(
          'myChart',
          'chartDom',
          'echarts',
          '$tw',
          `var option;${this.text};if (option instanceof Object) myChart.setOption(option);`,
        );
        addon(this.echartsInstance, this.containerDom, ECharts, $tw);
      }
      // add event listeners
      const getHandler = (handlerCallback: string) => (params: unknown) =>
        new Function_(
          'params',
          'parentWidget',
          `(${handlerCallback})(params, parentWidget);`,
        )(params, this.parentWidget);

      const dblclickHandlerString = this.getAttribute('dblclick');
      if (dblclickHandlerString) {
        this.echartsInstance.on('dblclick', getHandler(dblclickHandlerString));
      }
    } catch (error) {
      console.error(error);
    }
    this.echartsInstance.hideLoading();
  }
}

exports.echarts = EChartsWidget;
/* eslint-enable max-lines, no-bitwise */
/* eslint-enable @typescript-eslint/lines-between-class-members */
