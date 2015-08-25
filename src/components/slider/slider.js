import './slider.scss'

import Hammer from 'hammerjs'
import rebound from 'rebound'
import clamp from 'mout/math/clamp'
import css from 'dom-css'
import key from 'key-event'
import hidden from 'hidden'
import select from 'dom-select'

import CanvasComponent from '../canvas-component/canvas-component'
import DOMComponent from '../dom-component/dom-component'
import Close from '../close/close'
import More from '../more/more'
import Slide from '../slide/slide'
import viewport from '../utils/viewport'

export default class Slider extends DOMComponent {

    constructor (element) {
        super(element)

        const springSystem = new rebound.SpringSystem()

        this.callbacks = []

        this.slides = Array.from(select.all('[data-component="Slide"]', this.element))
        this.slides = this.slides.map(slide => new Slide(slide))

        this.center = 0
        this.velocity = 0

        this.close = new Close(select('[data-component="Close"]'))
        this.close.on('press', () => this.closeCurrentSlide())

        this.more = new More(select('[data-component="More"]'))
        this.more.colors = this.slides.map(slide => slide.colorReference)

        this.more.on('press', () => this.openCurrentSlide())
        this.more.on('mouseenter', () => this.slides[this.currentIndex].highlight())
        this.more.on('mouseleave', () => this.slides[this.currentIndex].release())

        this.stage = new CanvasComponent(select('[data-component="Stage"] canvas'))

        this.spring = springSystem.createSpring(4.5, 5.7)
        this.spring.addListener({
            onSpringUpdate: (spring) => this.springUpdate(spring),
            onSpringAtRest: (spring) => this.springComplete(spring)
        })
        
        for (let slide of this.slides) {
            this.addChild(slide)
        }

        this.goToPreviousSlide = this.goToPreviousSlide.bind(this)
        this.goToNextSlide = this.goToNextSlide.bind(this)
        this.openCurrentSlide = this.openCurrentSlide.bind(this)
        this.closeCurrentSlide = this.closeCurrentSlide.bind(this)

        this.addChild(this.close)
        this.addChild(this.more)
        this.addChild(this.stage)
    }

    init () {
        super.init()

        for (let slide of this.slides) {
            this.stage.addLayer(slide.stage)

            slide.on('previous', () => this.handlePrevious())
            slide.on('next', () => this.handleNext())
            slide.on('open', () => this.handleOpen())
            slide.on('close', (force) => this.handleClose(force))
        }

        this.initKeyboardEvents()
        this.initGestureManager()
        this.springUpdate(this.spring, true)
    }

    initKeyboardEvents () {
        key.on(window, 'down', this.openCurrentSlide)
        key.on(window, 'left', this.goToPreviousSlide)
        key.on(window, 'right', this.goToNextSlide)
    }

    removeKeyboardEvents () {
        key.off(window, 'down', this.openCurrentSlide)
        key.off(window, 'left', this.goToPreviousSlide)
        key.off(window, 'right', this.goToNextSlide)
    }

    initGestureManager () {
        this.gestureManager = new Hammer.Manager(this.element)
        this.gestureManager.add(new Hammer.Pan({direction: Hammer.DIRECTION_HORIZONTAL, threshold: 5}))

        this.gestureManager.on('panmove', (evt) => this.handlePan(evt))
        this.gestureManager.on('panstart', (evt) => this.handleStart(evt))
        this.gestureManager.on('panend pancancel', (evt) => this.handleRelease(evt))
    }

    removeGestureManager () {
        this.gestureManager.stop(true)
        this.gestureManager.destroy()
    }

    openCurrentSlide () {
        this.slides[this.currentIndex].open()
    }

    closeCurrentSlide(evt) {
        this.slides[this.currentIndex].close(true)
    }

    goToPreviousSlide () {
        this.goToSlideAtIndex(this.currentIndex - 1)
    }

    goToNextSlide () {
        this.goToSlideAtIndex(this.currentIndex + 1)
    }

    goToSlideAtIndex (index) {
        this.slides[this.currentIndex].release()

        this.currentIndex = index

        this.spring.setEndValue(this.currentIndex)
    }

    handleOpen () {
        this.removeKeyboardEvents()
        this.removeGestureManager()

        this.close.color = this.slides[this.currentIndex].colorReference
        this.close.show()
        this.more.hide()
    }

    handleClose (force) {
        this.close.hide()

        if (force) {
            this.initKeyboardEvents()
            this.initGestureManager()

            this.more.show()
        }
    }

    handlePrevious () {
        this.callbacks.push(() => {
            this.openCurrentSlide()
        })

        let index = this.currentIndex - 1

        if (index < 0) {
            index = 1 + Math.abs(index)
        }

        this.goToSlideAtIndex(index % this.slides.length)
    }

    handleNext () {
        this.callbacks.push(() => {
            this.openCurrentSlide()
        })

        this.goToSlideAtIndex((this.currentIndex + 1) % this.slides.length)
    }

    handleStart (evt) {
        this.center = evt.center.x
        this.spring.setAtRest()
    }

    handleRelease (evt) {
        this.removeGestureManager()

        let currentPosition = this.spring.getCurrentValue()
        let velocityTolerance = (Math.abs(this.velocity) > 3)
        let distanceTolerance = Math.abs(currentPosition - this.currentIndex) > 0.3

        if ((velocityTolerance || distanceTolerance) && this.velocity !== 0) {
            let forward = this.velocity < 0
            let index = this.currentIndex + rebound.MathUtil.mapValueInRange(+forward, 0, 1, -1, 1)

            this.currentIndex = index
        }

        let velocity = rebound.MathUtil.mapValueInRange(this.velocity, 0, -viewport.width, 0, 1)

        this.spring.setEndValue(this.currentIndex)
        this.spring.setVelocity(velocity * 30);

        this.initGestureManager()
    }

    handlePan (evt) {
        this.velocity = evt.center.x - this.center
        this.center = evt.center.x

        let progress = rebound.MathUtil.mapValueInRange(this.velocity, 0, -viewport.width, 0, 1)
        let currentValue = this.spring.getCurrentValue()
        
        if ((currentValue + progress) < 0 || (currentValue + progress) > this.slides.length - 1) {
            progress *= 0.5
        }
        
        this.spring.setCurrentValue(currentValue + progress)
        this.spring.setAtRest()
    }

    springComplete (spring) {
        for (let callback of this.callbacks) {
            callback()
        }

        this.callbacks = []
    }

    springUpdate (spring, force) {
        let progress = spring.getCurrentValue()

        this.more.progress = progress

        this.slides.forEach((slide, index) => {
            let slideProgress = 1 - Math.abs(progress - index)
            
            if (slideProgress > 0 || force) {
                let scale = rebound.MathUtil.mapValueInRange(slideProgress, 0, 1, 0.6, 1)
                let x = viewport.width * (index - progress)

                slide.translation[0] = x
                slide.header.scale[0] = scale
                slide.header.scale[1] = scale
            }

            slide.render()
            slide.header.render()
        })

        this.more.render()
        this.render()
    }

    resize () {
        super.resize()

        this.springUpdate(this.spring, true)

        this.stage.resize()
    }

    get currentIndex () {
        return this._currentIndex || 0
    }

    set currentIndex (index) {
        this._currentIndex = clamp(index, 0, this.slides.length - 1)
    }

}
